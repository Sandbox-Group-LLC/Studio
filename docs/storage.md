# Storage

Two stores, two jobs.

| Store | Holds | Why |
| --- | --- | --- |
| Neon Postgres | The queue and every track's metadata | Several kiosks and the floor host read one shared queue |
| S3 `amzn-s3-studio` (us-east-1) | Finished mp3s and cover art | The provider's URLs expire; a souvenir has to be ours |

## Why the audio must be copied

The music provider returns result URLs that expire in roughly 24 hours, and it
retains generated media for about 14 days. Until the bytes are in our bucket, an
attendee's souvenir page is a pointer at someone else's disk — a guest who opens
their link the next morning finds nothing.

So `server/ingest.ts` runs the moment the poller marks a track `ready`, not
lazily on first request. It is deliberately **not awaited**: an upload must never
make a guest wait, and an S3 failure must never fail a generation. If ingest
fails, the track stays playable through the provider proxy and hourly
housekeeping retries it.

`audio_key` is authoritative. `audio_url` is a disposable fallback.

## Retention

`RETENTION_DAYS` defaults to **365**. Every ingested track gets a `purge_after`
timestamp, and hourly housekeeping deletes expired objects and then their rows —
objects first, so a record is never dropped while its files may still exist.

This matters more than typical housekeeping. Each row holds an attendee's first
name and their stated financial goal, captured at a brokerage's event. Purging on
schedule is a commitment to the guest, which is why it is automatic rather than a
task someone has to remember. Expect Robinhood's legal and privacy review to ask
for exactly this; the answer is a documented purge date and a working delete
path, both of which exist here.

To honor an individual deletion request, delete the row by claim code — the
hourly sweep removes the objects, or call the same path directly.

## IAM

Access should be **scoped to this one bucket and nothing else**. The blast radius
should be one bucket of event audio, revocable the moment the activation is over.

**Current state:** the grant is attached to the existing `sandbox-erp` principal
(`arn:aws:iam::562887205506:user/sandbox-erp`), confined to the `tracks/*` prefix.
That is fine for development. Before the event, move to a **dedicated principal**
used only by this app — sharing `sandbox-erp` with other tooling means you cannot
revoke one without breaking the others, and it makes the access log useless for
telling which system touched an attendee's file.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TheScoreObjects",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::amzn-s3-studio/tracks/*"
    },
    {
      "Sid": "TheScoreBucketCheck",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::amzn-s3-studio",
      "Condition": { "StringLike": { "s3:prefix": "tracks/*" } }
    }
  ]
}
```

Write access is confined to the `tracks/` prefix, so this key cannot touch
anything else already in the bucket. `ListBucket` is only there so the app can
report bucket reachability on the operator dashboard.

S3 authenticates with SigV4 request signing rather than a simple token header,
so the SDK needs `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the
environment. On a real host, prefer an instance role or task role and drop the
static keys entirely.

## Keep the bucket private

Objects are served through `/api/tracks/:code/audio`, which is range-transparent
because mobile Safari refuses audio sources that can't serve partial content.
There is no reason to make the bucket public: a claim code is short enough to
guess at scale, and public objects would outlive our own retention policy.

Set `S3_PUBLIC_BASE_URL` only if you later put CloudFront in front of it, and
use signed URLs if you do.

## Degrading without storage

With no `S3_BUCKET` set, the app runs normally and proxies audio from the
provider. The operator dashboard shows "No storage" rather than a green
`Saved n/n`, so the gap is visible to the host instead of silent. A silent ingest
failure is the dangerous case — it looks fine all show and surfaces days later as
dead links.

## Verified

Checked against `amzn-s3-studio` (us-east-1) on 2026-09-20, after the prefix
policy was attached.

| Check | Result |
| --- | --- |
| `s3:PutObject` to `tracks/8C9HX2/audio.mp3` | Succeeded — previously `AccessDenied` |
| Read back | 2,846,810 bytes, `Content-Type: audio/mpeg`, 119.88s at ~190kbps |
| `Range: bytes=0-1023` | `206 Partial Content`, `Content-Range: bytes 0-1023/2846810` |
| Prefix scoping | Writes confined to `tracks/*` |
| No-bucket fallback | App runs, proxies from provider, dashboard reads `No storage` |

The range check is the one that mattered. Mobile Safari refuses audio sources
that cannot serve partial content, so a store that returns only `200 OK` would
work on every desktop test rig and fail on every iPhone at the event — which is
the whole audience.

**Not yet exercised:** the app's own ingest path. The verification above was done
out-of-band, because S3 authenticates with SigV4 request signing and the
development sandbox has no AWS credentials in its environment. What is proven is
the bucket, the policy, and the key layout; what remains is running the same
operations from the app's own credentials.

## Deploy credentials

`server/objects.ts` reads standard AWS environment configuration, so no code
changes are needed for any of these. Setting `S3_BUCKET` with credentials present
is the entire switch.

In order of preference:

1. **Instance or task role** on the host that runs the app. No secret exists to
   leak, rotate, or accidentally commit. This is the right answer for the event.
2. **A dedicated IAM user's access key** in the deploy environment, if roles are
   not available. Scope it with the policy above and delete the user when the
   activation ends.
3. **Never** a broad or shared key. The app needs three actions on one prefix.

Confirm on first boot by opening the operator dashboard: the header chip should
read `Saved n/n` in green rather than `No storage`. If it reads red, the bucket is
configured but unreachable — check the policy before assuming the code.
