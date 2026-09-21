import { pgTable, text, integer, serial, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * One row per attendee track. `claimCode` is the short code printed on the
 * kiosk handoff screen and encoded in the QR — it is the only identifier the
 * attendee's phone ever sees, so the numeric id is never exposed.
 */
export const tracks = pgTable("tracks", {
  id: serial("id").primaryKey(),
  claimCode: text("claim_code").notNull().unique(),

  // What the attendee tapped
  preset: text("preset").notNull(),
  vibe: text("vibe").notNull(),
  angle: text("angle").notNull(),
  firstName: text("first_name"),
  goal: text("goal"),
  spin: text("spin"),

  // What we sent to the model
  title: text("title").notNull(),
  style: text("style").notNull(),
  prompt: text("prompt").notNull(),

  // Job lifecycle: queued | generating | ready | failed
  status: text("status").notNull().default("queued"),
  taskId: text("task_id"),
  audioUrl: text("audio_url"),
  streamUrl: text("stream_url"),
  imageUrl: text("image_url"),
  lyrics: text("lyrics"),
  durationSec: integer("duration_sec"),
  errorMessage: text("error_message"),

  kioskId: text("kiosk_id").notNull().default("booth-1"),

  // Objects in our own bucket. Authoritative once set: the provider's URLs
  // expire in ~24h and its media retention is ~14 days, so a track is only
  // truly ours once these keys are populated.
  audioKey: text("audio_key"),
  imageKey: text("image_key"),
  storedAt: bigint("stored_at", { mode: "number" }),

  /** Epoch ms after which this row and its objects must be deleted. */
  purgeAfter: bigint("purge_after", { mode: "number" }),

  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  readyAt: bigint("ready_at", { mode: "number" }),
});

export const createTrackSchema = z.object({
  preset: z.enum(["moonshot", "compounder", "hustler", "legacy"]),
  vibe: z.string().min(1).max(40),
  angle: z.string().min(1).max(40),
  firstName: z.string().max(24).optional(),
  goal: z.string().max(80).optional(),
  spin: z.string().max(200).optional(),
  kioskId: z.string().max(40).optional(),
});

export const insertTrackSchema = createInsertSchema(tracks).omit({ id: true });

export type CreateTrackInput = z.infer<typeof createTrackSchema>;
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type Track = typeof tracks.$inferSelect;

/** Trimmed shape returned to the attendee's phone — no prompt internals. */
export interface PublicTrack {
  claimCode: string;
  preset: string;
  title: string;
  status: string;
  audioUrl: string | null;
  streamUrl: string | null;
  imageUrl: string | null;
  /** Human-readable production descriptor, shown as credits on the phone. */
  style: string;
  durationSec: number | null;
  firstName: string | null;
  goal: string | null;
  createdAt: number;
  readyAt: number | null;
}
