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

Use a **dedicated IAM user scoped to this one bucket**. Do not reuse an existing
key. The blast radius should be one bucket of event audio, and the user should be
deletable the moment the activation is over.

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
