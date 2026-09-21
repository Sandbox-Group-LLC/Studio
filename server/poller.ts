import { storage } from "./storage";
import { getTaskResult } from "./kie";
import { log } from "./log";
import { ingestTrack } from "./ingest";

/**
 * Single background poller for every in-flight job.
 *
 * Deliberately not a webhook: the kiosk runs on venue wifi behind NAT with no
 * inbound route, so polling is the only delivery path that survives the floor.
 * One shared timer keeps request volume flat regardless of queue depth.
 */
const INTERVAL_MS = 6000;
const TIMEOUT_MS = 12 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const pending = await storage.listPending();
    for (const track of pending) {
      // Nothing submitted yet, or submission failed — leave it for the operator.
      if (!track.taskId) continue;

      if (Date.now() - track.createdAt > TIMEOUT_MS) {
        await storage.updateTrack(track.id, {
          status: "failed",
          errorMessage: "Timed out waiting for the music API (over 12 minutes)",
        });
        log(`track ${track.claimCode} timed out`, "poller");
        continue;
      }

      try {
        const result = await getTaskResult(track.taskId);

        if (result.state === "success") {
          const ready = await storage.updateTrack(track.id, {
            status: "ready",
            audioUrl: result.audioUrl ?? null,
            streamUrl: result.streamUrl ?? null,
            imageUrl: result.imageUrl ?? null,
            lyrics: result.lyrics ?? null,
            durationSec: result.durationSec ?? null,
            readyAt: Date.now(),
          });
          log(`track ${track.claimCode} ready`, "poller");

          // Copy the bytes into our own bucket immediately. Provider URLs expire
          // in ~24h, so waiting for the attendee's first request can be too late.
          // Not awaited: the guest's page must not wait on an upload.
          if (ready) void ingestTrack(ready);
        } else if (result.state === "fail") {
          await storage.updateTrack(track.id, {
            status: "failed",
            errorMessage: result.failMessage ?? "Generation failed",
          });
          log(`track ${track.claimCode} failed: ${result.failMessage}`, "poller");
        } else if (track.status !== "generating") {
          await storage.updateTrack(track.id, { status: "generating" });
        }
      } catch (err: any) {
        // Transient network errors are expected on venue wifi; keep polling and
        // let the timeout above be the only terminal condition.
        log(`poll error for ${track.claimCode}: ${err?.message}`, "poller");
      }
    }
  } catch (err: any) {
    // The whole tick, not just one track. `listPending()` reaching a database
    // that is briefly unreachable used to reject straight out of the timer
    // callback, which Node treats as an unhandled rejection and kills the
    // process. A kiosk mid-show must survive a database blip, so the tick logs
    // and the next one retries.
    log(`tick failed: ${err?.message}`, "poller");
  } finally {
    running = false;
  }
}

export function startPoller() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL_MS);
  log("generation poller started", "poller");
}
