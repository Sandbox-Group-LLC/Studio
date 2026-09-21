import { tracks } from "@shared/schema";
import type { Track, InsertTrack } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, inArray, and, lt, isNotNull } from "drizzle-orm";

/**
 * Postgres (Neon) rather than a local SQLite file, so several kiosks and the
 * floor operator dashboard all read one shared queue. A file on one box means a
 * second booth is invisible to the first and the host can't see the whole floor.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and add the Neon connection string.",
  );
}

export const pool = new Pool({
  connectionString,
  // Kiosks are long-lived and mostly idle between guests; a small pool is plenty
  // and keeps well clear of the pooler's connection ceiling.
  max: 8,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * Without this, an error on an *idle* pooled client is an unhandled 'error'
 * event, which takes the whole process down. Neon's pooler drops idle
 * connections routinely, so this is a normal Tuesday, not an emergency — log it
 * and let the pool replace the client.
 */
pool.on("error", (err) => {
  console.error(`[db] idle client error: ${err.message}`);
});

export const db = drizzle(pool);

export interface IStorage {
  createTrack(track: InsertTrack): Promise<Track>;
  getTrackByClaimCode(code: string): Promise<Track | undefined>;
  getTrackById(id: number): Promise<Track | undefined>;
  listTracks(limit?: number): Promise<Track[]>;
  listPending(): Promise<Track[]>;
  listExpired(now?: number): Promise<Track[]>;
  updateTrack(id: number, patch: Partial<Track>): Promise<Track | undefined>;
  deleteTrack(id: number): Promise<void>;
  claimCodeExists(code: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async createTrack(track: InsertTrack): Promise<Track> {
    const [row] = await db.insert(tracks).values(track as any).returning();
    return row;
  }

  async getTrackByClaimCode(code: string): Promise<Track | undefined> {
    const [row] = await db
      .select()
      .from(tracks)
      .where(eq(tracks.claimCode, code.toUpperCase()))
      .limit(1);
    return row;
  }

  async getTrackById(id: number): Promise<Track | undefined> {
    const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
    return row;
  }

  async listTracks(limit = 200): Promise<Track[]> {
    return db.select().from(tracks).orderBy(desc(tracks.id)).limit(limit);
  }

  /** Jobs the poller still needs to watch. */
  async listPending(): Promise<Track[]> {
    return db
      .select()
      .from(tracks)
      .where(inArray(tracks.status, ["queued", "generating"]));
  }

  /**
   * Tracks past their retention date. These hold an attendee's first name and
   * stated financial goal, so purging on schedule is a commitment, not a chore.
   */
  async listExpired(now = Date.now()): Promise<Track[]> {
    return db
      .select()
      .from(tracks)
      .where(and(isNotNull(tracks.purgeAfter), lt(tracks.purgeAfter, now)));
  }

  async updateTrack(id: number, patch: Partial<Track>): Promise<Track | undefined> {
    const [row] = await db
      .update(tracks)
      .set(patch as any)
      .where(eq(tracks.id, id))
      .returning();
    return row;
  }

  async deleteTrack(id: number): Promise<void> {
    await db.delete(tracks).where(eq(tracks.id, id));
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
