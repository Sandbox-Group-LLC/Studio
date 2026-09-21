# The Score

An activation kiosk for **HOOD Summit 2027**. An attendee answers four taps about how
they invest, and walks away with an original two-minute track written for them.

> Just as Robinhood disrupted Wall Street by giving retail investors the tools to control
> their financial destiny, Suno disrupted the music industry by giving everyday users the
> tools to compose high-quality music without a studio, a label, or formal training. In
> both cases the barrier to entry is obliterated, turning passive consumers into active
> creators.

Full creative rationale lives in [SPEC.md](./SPEC.md).

---

## The three surfaces

| Route      | Who uses it        | What it does                                                        |
| ---------- | ------------------ | ------------------------------------------------------------------- |
| `/`        | Booth touchscreen  | Attract loop → 4-step flow → QR handoff                             |
| `/#/t/:code` | Attendee's phone | Live render progress, then player, lyrics, save and share           |
| `/#/ops`   | Floor host         | Live queue, render times, failures with reasons, one-tap retry      |

### Why the QR handoff

Generation takes roughly 90–150 seconds. If an attendee waits at the terminal for that,
the booth becomes the bottleneck and the line stops moving. Instead the kiosk hands off
immediately: a QR code plus a six-character claim code, and the booth is free for the next
guest in about twenty seconds. The attendee follows their track on their own phone and
listens at a headphone station when it lands — which also means they leave with the track
on their device rather than a memory of a booth.

### Why polling, not webhooks

The provider recommends `callBackUrl` for production, but a kiosk on venue wifi sits behind
NAT with no inbound route. A single shared poller (`server/poller.ts`) watches every
in-flight job every six seconds, so request volume stays flat regardless of queue depth and
nothing depends on the venue's network accepting inbound traffic.

---

## Running it

```bash
npm install
npm run dev          # Express + Vite on http://localhost:5000
```

### The API key

Generation calls [kie.ai](https://docs.kie.ai/) — `POST /api/v1/jobs/createTask` to submit,
`GET /api/v1/jobs/recordInfo` to poll.

The key is **never stored in this repo or in the process**. Outbound calls are made through
`curl` (`server/kie.ts`), and credentials are injected by an authenticating HTTPS proxy at
the environment level. Node's global `fetch` ignores `HTTPS_PROXY` and would send the
request unauthenticated, which is why `curl` is the transport.

Running outside that environment: export the key and add
`-H "Authorization: Bearer $KIE_API_KEY"` in `server/kie.ts`, or keep the proxy pattern.

Without a key the whole app still runs — submissions land in the queue and surface as
`Unauthorized` on the ops dashboard, which is the same failure path a bad key produces at
the show.

---

## Creative changes

**Everything creative lives in [`shared/presets.ts`](./shared/presets.ts).** The four styles,
their vibe and lyric modifiers, goal chips, accent colors, and the prompt composition all
come from that one file. The kiosk UI renders whatever is there — adding a fifth style or
rewording a lyric theme requires no UI work.

`composePrompt()` is a pure function shared by the server and the ops view, so the exact
style and lyric direction sent to the model is always inspectable per track.

### Prompt guardrails

Composed lyric direction explicitly instructs the model not to mention Robinhood, tickers,
brand names, or anything resembling financial advice. Each preset also carries
`negativeTags` to keep a style from drifting.

---

## Show-floor notes

- **Claim codes** use a 29-character alphabet with `0/O`, `1/I` and `5/S` removed, so a code
  read off the screen can't be mistyped into a different track.
- **Idle reset**: any step returns to the attract loop after 75 seconds of no input, and the
  handoff screen clears after 45 seconds. No guest ever sees the previous guest's name.
- **Retry keeps the claim code**, so a host can re-run a failed track and the QR the attendee
  already scanned still works.
- **Audio is proxied** through `/api/tracks/:code/audio` with byte-range support. Provider
  URLs expire in about 24 hours and mobile Safari refuses non-range audio sources.
- **Media retention**: the provider keeps generated files roughly 14 days. For anything that
  needs to outlive the show, download finished tracks to your own storage.

## Stack

Express 5 · Vite · React 18 · Tailwind 3 · shadcn/ui · SQLite (Drizzle) · TypeScript
