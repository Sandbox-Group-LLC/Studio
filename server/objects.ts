import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

/**
 * Object storage for finished tracks and cover art.
 *
 * The provider's result URLs expire in roughly 24 hours and its media retention
 * is about 14 days, so a track only becomes genuinely ours once the bytes are in
 * this bucket. Everything else in the app treats an object key as authoritative
 * and the provider URL as a disposable fallback.
 *
 * Written against the S3 API with a configurable endpoint, so the same code runs
 * on AWS S3 or any S3-compatible store without modification.
 */

const BUCKET = process.env.S3_BUCKET;
const REGION = process.env.S3_REGION || "us-east-1";
const ENDPOINT = process.env.S3_ENDPOINT || undefined;
const PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || undefined;

/** How long an attendee's track is kept before it must be purged. */
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 365);

/**
 * Storage is optional at boot. Without it the app still runs and still serves
 * audio by proxying the provider, so a missing bucket degrades the durability
 * guarantee rather than taking the booth down mid-event.
 */
export function isConfigured(): boolean {
  return Boolean(BUCKET);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!BUCKET) throw new Error("S3_BUCKET is not set");
  if (!client) {
    client = new S3Client({
      region: REGION,
      ...(ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {}),
    });
  }
  return client;
}

/** Verifies credentials and bucket access. Surfaced on the operator dashboard. */
export async function checkAccess(): Promise<{ ok: boolean; message: string }> {
  if (!BUCKET) return { ok: false, message: "No bucket configured" };
  try {
    await s3().send(new HeadBucketCommand({ Bucket: BUCKET }));
    return { ok: true, message: `${BUCKET} (${REGION})` };
  } catch (err: any) {
    return { ok: false, message: err?.name || err?.message || "Bucket unreachable" };
  }
}

/** Object keys are grouped by claim code so a single track is easy to purge. */
export function audioKeyFor(claimCode: string): string {
  return `tracks/${claimCode}/audio.mp3`;
}

export function imageKeyFor(claimCode: string): string {
  return `tracks/${claimCode}/cover.jpeg`;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // A track is immutable once rendered, so it can be cached hard.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export interface ObjectRead {
  stream: Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  status: 200 | 206;
}

/**
 * Reads an object, forwarding a byte range when asked. Range support is not
 * optional: mobile Safari refuses to play an audio source that can't serve
 * partial content.
 */
export async function getObject(key: string, range?: string): Promise<ObjectRead> {
  const out = await s3().send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key, ...(range ? { Range: range } : {}) }),
  );
  return {
    stream: out.Body as Readable,
    contentType: out.ContentType,
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
    status: out.ContentRange ? 206 : 200,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Direct URL for an object, when the bucket is served publicly. */
export function publicUrlFor(key: string): string | null {
  if (!PUBLIC_BASE_URL) return null;
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}
