import { tracks } from '@shared/schema';
import type { Track, InsertTrack } from '@shared/schema';
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, inArray } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Created eagerly so a fresh checkout boots without a separate migration step.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    claim_code TEXT NOT NULL UNIQUE,
    preset TEXT NOT NULL,
    vibe TEXT NOT NULL,
    angle TEXT NOT NULL,
    first_name TEXT,
    goal TEXT,
    spin TEXT,
    title TEXT NOT NULL,
    style TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    task_id TEXT,
    audio_url TEXT,
    stream_url TEXT,
    image_url TEXT,
    lyrics TEXT,
    duration_sec INTEGER,
    error_message TEXT,
    kiosk_id TEXT NOT NULL DEFAULT 'booth-1',
    created_at INTEGER NOT NULL,
    ready_at INTEGER
  );
`);

export interface IStorage {
  createTrack(track: InsertTrack): Promise<Track>;
  getTrackByClaimCode(code: string): Promise<Track | undefined>;
  getTrackById(id: number): Promise<Track | undefined>;
  listTracks(limit?: number): Promise<Track[]>;
  listPending(): Promise<Track[]>;
  updateTrack(id: number, patch: Partial<Track>): Promise<Track | undefined>;
  claimCodeExists(code: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createTrack(track: InsertTrack): Promise<Track> {
    return db.insert(tracks).values(track as any).returning().get();
  }

  async getTrackByClaimCode(code: string): Promise<Track | undefined> {
    return db.select().from(tracks).where(eq(tracks.claimCode, code.toUpperCase())).get();
  }

  async getTrackById(id: number): Promise<Track | undefined> {
    return db.select().from(tracks).where(eq(tracks.id, id)).get();
  }

  async listTracks(limit = 200): Promise<Track[]> {
    return db.select().from(tracks).orderBy(desc(tracks.id)).limit(limit).all();
  }

  /** Jobs the poller still needs to watch. */
  async listPending(): Promise<Track[]> {
    return db
      .select()
      .from(tracks)
      .where(inArray(tracks.status, ["queued", "generating"]))
      .all();
  }

  async updateTrack(id: number, patch: Partial<Track>): Promise<Track | undefined> {
    return db.update(tracks).set(patch as any).where(eq(tracks.id, id)).returning().get();
  }

  async claimCodeExists(code: string): Promise<boolean> {
    return !!(await this.getTrackByClaimCode(code));
  }
}

export const storage = new DatabaseStorage();

/**
 * Human-friendly claim codes. Ambiguous characters (0/O, 1/I, 5/S) are excluded
 * so an attendee can read a code off the screen and type it without failing.
 */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXYZ2346789";

export async function generateClaimCode(): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!(await storage.claimCodeExists(code))) return code;
  }
  throw new Error("Could not allocate a unique claim code");
}
