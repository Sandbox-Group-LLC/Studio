import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { storage } from "./storage";
import { log } from "./log";
import {
  isConfigured,
  putObject,
  deleteObject,
  audioKeyFor,
  imageKeyFor,
  RETENTION_DAYS,
} from "./objects";
import type { Track } from "@shared/schema";

const execFileAsync = promisify(execFile);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Downloads a provider asset. Uses curl rather than fetch for the same reason as
 * the API client: it honours the environment's proxy configuration, and it gives
 * us a hard timeout without extra plumbing.
 */
async function download(url: string): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "--fail", "--max-time", "120", "-L", url],
    { maxBuffer: 1024 * 1024 * 64, encoding: "buffer" },
  );
  if (!stdout?.length) throw new Error("Downloaded asset was empty");
  return stdout as unknown as Buffer;
}

/**
 * Copies a finished track's audio and cover art into our own bucket.
 *
 * This is the difference between owning an attendee's souvenir and pointing at
 * someone else's disk. Provider result URLs expire in roughly 24 hours, so this
 * runs the moment a track is ready rather than lazily on first request — a guest
 * who opens their link the next morning would otherwise find nothing.
 */
export async function ingestTrack(track: Track): Promise<void> {
  if (!isConfigured()) return;
  if (track.audioKey) return; // already ours
  if (!track.audioUrl) return;

  const audioKey = audioKeyFor(track.claimCode);
  const imageKey = track.imageUrl ? imageKeyFor(track.claimCode) : null;

  try {
    const audio = await download(track.audioUrl);
    await putObject(audioKey, audio, "audio/mpeg");

    // Cover art is a nice-to-have. Losing it must not cost us the audio.
    let storedImageKey: string | null = null;
    if (imageKey && track.imageUrl) {
      try {
        const image = await download(track.imageUrl);
        await putObject(imageKey, image, "image/jpeg");
        storedImageKey = imageKey;
      } catch (err: any) {
        log(`cover art ingest failed for ${track.claimCode}: ${err?.message}`, "ingest");
      }
    }

    const now = Date.now();
    await storage.updateTrack(track.id, {
      audioKey,
      imageKey: storedImageKey,
      storedAt: now,
      purgeAfter: now + RETENTION_DAYS * DAY_MS,
    });

    log(
      `stored ${track.claimCode} (${(audio.length / 1024 / 1024).toFixed(2)}MB)`,
      "ingest",
    );
  } catch (err: any) {
    // Deliberately non-fatal. The track stays playable via the provider proxy,
    // and the next sweep retries, so a transient S3 blip never fails a guest.
    log(`ingest failed for ${track.claimCode}: ${err?.message}`, "ingest");
  }
}

/**
 * Retries tracks that are ready but not yet stored. Covers the window where S3
 * was misconfigured or unreachable while the show was still running.
 */
export async function retryUningested(): Promise<number> {
  if (!isConfigured()) return 0;
  const all = await storage.listTracks(500);
  const pending = all.filter((t) => t.status === "ready" && !t.audioKey && t.audioUrl);
  for (const track of pending) {
    await ingestTrack(track);
  }
  return pending.length;
}

/**
 * Deletes tracks past their retention date, objects first.
 *
 * These rows hold an attendee's first name and their stated financial goal,
 * captured at a brokerage's event. Purging on schedule is a commitment we make
 * to them, so it runs automatically rather than waiting for someone to remember.
 */
export async function purgeExpired(): Promise<number> {
  const expired = await storage.listExpired();
  let purged = 0;

  for (const track of expired) {
    try {
      if (isConfigured()) {
        if (track.audioKey) await deleteObject(track.audioKey);
        if (track.imageKey) await deleteObject(track.imageKey);
      }
      await storage.deleteTrack(track.id);
      purged++;
    } catch (err: any) {
      // Leave the row in place so the next sweep tries again. Never drop the
      // record while its objects may still exist.
      log(`purge failed for ${track.claimCode}: ${err?.message}`, "retention");
    }
  }

  if (purged) log(`purged ${purged} expired track(s)`, "retention");
  return purged;
}

/** Hourly housekeeping: retry anything unstored, then purge anything expired. */
export function startHousekeeping(): void {
  const run = async () => {
    try {
      await retryUningested();
      await purgeExpired();
    } catch (err: any) {
      log(`housekeeping error: ${err?.message}`, "retention");
    }
  };
  void run();
  setInterval(run, 60 * 60 * 1000).unref();
}
