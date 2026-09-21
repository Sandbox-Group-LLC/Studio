import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { storage, generateClaimCode } from "./storage";
import { createTrackSchema, type PublicTrack, type Track } from "@shared/schema";
import { composePrompt, cleanName, PRESETS } from "@shared/presets";
import { createMusicTask, getCredits } from "./kie";
import { startPoller } from "./poller";
import { log } from "./log";

function toPublic(t: Track): PublicTrack {
  return {
    claimCode: t.claimCode,
    preset: t.preset,
    title: t.title,
    status: t.status,
    audioUrl: t.audioUrl,
    streamUrl: t.streamUrl,
    imageUrl: t.imageUrl,
    style: t.style,
    durationSec: t.durationSec,
    firstName: t.firstName,
    goal: t.goal,
    createdAt: t.createdAt,
    readyAt: t.readyAt,
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  startPoller();

  /** Creative config, so the kiosk UI is driven entirely by shared/presets.ts. */
  app.get("/api/presets", (_req, res) => {
    res.json(PRESETS);
  });

  /**
   * Kiosk submit. Responds as soon as the job is accepted so the booth frees up
   * immediately — the attendee walks away with a claim code while the track
   * renders in the background.
   */
  app.post("/api/tracks", async (req: Request, res: Response) => {
    const parsed = createTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid selection", issues: parsed.error.issues });
    }
    const input = parsed.data;

    const composed = composePrompt(input);
    const claimCode = await generateClaimCode();

    const track = await storage.createTrack({
      claimCode,
      preset: input.preset,
      vibe: input.vibe,
      angle: input.angle,
      firstName: cleanName(input.firstName) || null,
      goal: input.goal || null,
      spin: input.spin || null,
      title: composed.title,
      style: composed.style,
      prompt: composed.prompt,
      status: "queued",
      taskId: null,
      audioUrl: null,
      streamUrl: null,
      imageUrl: null,
      lyrics: null,
      durationSec: null,
      errorMessage: null,
      kioskId: input.kioskId || "booth-1",
      createdAt: Date.now(),
      readyAt: null,
    } as any);

    // Respond first, submit second: a slow provider must never block the booth.
    res.status(201).json({ claimCode: track.claimCode, status: track.status });

    try {
      const taskId = await createMusicTask({
        title: composed.title,
        style: composed.style,
        prompt: composed.prompt,
        negativeTags: composed.negativeTags,
      });
      await storage.updateTrack(track.id, { taskId, status: "generating" });
      log(`submitted ${track.claimCode} as task ${taskId}`, "tracks");
    } catch (err: any) {
      await storage.updateTrack(track.id, {
        status: "failed",
        errorMessage: err?.message || "Could not reach the music API",
      });
      log(`submit failed for ${track.claimCode}: ${err?.message}`, "tracks");
    }
  });

  /** Attendee phone view — polled until the track is ready. */
  app.get("/api/tracks/:claimCode", async (req, res) => {
    const track = await storage.getTrackByClaimCode(req.params.claimCode);
    if (!track) return res.status(404).json({ message: "No track found for that code" });
    res.json(toPublic(track));
  });

  /** Operator dashboard: full queue including prompts and failure reasons. */
  app.get("/api/ops/tracks", async (_req, res) => {
    const all = await storage.listTracks();
    res.json({
      tracks: all,
      stats: {
        total: all.length,
        ready: all.filter((t) => t.status === "ready").length,
        inFlight: all.filter((t) => t.status === "queued" || t.status === "generating").length,
        failed: all.filter((t) => t.status === "failed").length,
        byPreset: PRESETS.map((p) => ({
          preset: p.id,
          label: p.label,
          count: all.filter((t) => t.preset === p.id).length,
        })),
        medianSeconds: medianRenderSeconds(all),
      },
    });
  });

  /** Re-submit a failed job under the same claim code, so the QR still works. */
  app.post("/api/ops/tracks/:claimCode/retry", async (req, res) => {
    const track = await storage.getTrackByClaimCode(req.params.claimCode);
    if (!track) return res.status(404).json({ message: "No track found for that code" });

    await storage.updateTrack(track.id, {
      status: "queued",
      errorMessage: null,
      taskId: null,
      createdAt: Date.now(),
    });

    try {
      const taskId = await createMusicTask({
        title: track.title,
        style: track.style,
        prompt: track.prompt,
        negativeTags: "",
      });
      const updated = await storage.updateTrack(track.id, { taskId, status: "generating" });
      res.json(updated);
    } catch (err: any) {
      const updated = await storage.updateTrack(track.id, {
        status: "failed",
        errorMessage: err?.message || "Retry failed",
      });
      res.status(502).json(updated);
    }
  });

  app.get("/api/ops/credits", async (_req, res) => {
    res.json({ credits: await getCredits() });
  });

  /**
   * Streams the finished audio through our own origin. Provider URLs expire in
   * about 24 hours and block cross-origin download, so the phone player and the
   * "save" button both go through here.
   */
  app.get("/api/tracks/:claimCode/audio", async (req, res) => {
    const track = await storage.getTrackByClaimCode(req.params.claimCode);
    if (!track?.audioUrl) return res.status(404).json({ message: "Audio not ready" });

    try {
      // Forward the browser's Range header. Mobile Safari refuses to play an
      // <audio> source that doesn't honour ranges, and without it there is no
      // seeking — so this proxy has to be range-transparent, not just a pipe.
      const range = req.headers.range;
      const upstream = await fetch(track.audioUrl, {
        headers: {
          "User-Agent": "TheScore-Kiosk/1.0",
          ...(range ? { Range: range } : {}),
        },
      });

      if (!upstream.ok || !upstream.body) {
        return res.status(502).json({ message: "Upstream audio unavailable" });
      }

      const safeTitle = track.title.replace(/[^a-z0-9\- ]/gi, "").trim() || "The Score";
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (req.query.download === "1") {
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.mp3"`);
      }
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) res.setHeader("Content-Range", contentRange);
      const len = upstream.headers.get("content-length");
      if (len) res.setHeader("Content-Length", len);
      // 206 only when upstream actually honoured the range.
      res.status(upstream.status === 206 ? 206 : 200);

      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err: any) {
      res.status(502).json({ message: err?.message || "Could not stream audio" });
    }
  });

  return httpServer;
}

function medianRenderSeconds(all: Track[]): number | null {
  const times = all
    .filter((t) => t.readyAt && t.createdAt)
    .map((t) => (t.readyAt! - t.createdAt) / 1000)
    .sort((a, b) => a - b);
  if (!times.length) return null;
  const mid = Math.floor(times.length / 2);
  const value = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return Math.round(value);
}
