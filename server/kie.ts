import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Overridable so the transport can be pointed at a mock or a corporate proxy
// without touching code. Defaults to the real provider.
const API_ORIGIN = process.env.KIE_API_ORIGIN?.replace(/\/$/, "") || "https://api.kie.ai";
const CREATE_PATH = "/api/v1/jobs/createTask";
const RECORD_PATH = "/api/v1/jobs/recordInfo";
const CREDIT_PATH = "/api/v1/chat/credit";
const MODEL = "ai-music-api/generate";

/**
 * Two credential transports are supported, and which one is active depends on
 * how the process was started — so both are handled rather than assumed.
 *
 * 1. Pass-through endpoint: a base URL plus a token. The target path is
 *    appended to the base URL and the token goes out as `x-api-key`. This is
 *    what a long-running server process receives.
 * 2. Transparent HTTPS proxy: the real origin is called directly and auth is
 *    injected in flight. No headers needed.
 *
 * Either way the provider key itself never exists in this codebase.
 */
const API_KEY = process.env.KIE_API_KEY;
const PASS_THROUGH_URL = process.env.CUSTOM_CRED_API_KIE_AI_URL;
const PASS_THROUGH_KEY = process.env.CUSTOM_CRED_API_KIE_AI_PROXY_AUTH_KEY;
const USE_PASS_THROUGH = !API_KEY && Boolean(PASS_THROUGH_URL && PASS_THROUGH_KEY);

/** Which transport is active. Surfaced on the operator dashboard and at boot. */
export function transport(): "direct" | "pass-through" | "none" {
  if (API_KEY) return "direct";
  if (USE_PASS_THROUGH) return "pass-through";
  return "none";
}

/**
 * Fail loudly at boot rather than at the first guest.
 *
 * Without a key the requests below go out unauthenticated and the provider
 * answers 401 — which would present on the floor as every single track failing
 * for no visible reason. Better to say so while someone is still looking at a
 * terminal.
 */
if (transport() === "none") {
  console.warn(
    "[kie] No KIE_API_KEY set. Music generation will fail with 401 unless an " +
      "authenticating proxy is in front of this process.",
  );
}

/** Resolves an API path to a callable URL for whichever transport is active. */
function endpoint(path: string): string {
  if (USE_PASS_THROUGH) {
    return `${PASS_THROUGH_URL!.replace(/\/$/, "")}${path}`;
  }
  return `${API_ORIGIN}${path}`;
}

/** Auth headers required by the active transport, as curl arguments. */
function authArgs(): string[] {
  if (API_KEY) return ["-H", `Authorization: Bearer ${API_KEY}`];
  if (USE_PASS_THROUGH) return ["-H", `x-api-key: ${PASS_THROUGH_KEY}`];
  return [];
}

/**
 * All outbound calls go through `curl` rather than Node's global fetch.
 *
 * The API key is never held in this process: it is injected by the sandbox's
 * authenticating HTTPS proxy. Node's built-in fetch ignores HTTPS_PROXY, which
 * would send the request unauthenticated, so curl is the reliable transport
 * here. It also keeps the secret out of the codebase entirely.
 */
async function curlJson(args: string[]): Promise<any> {
  const { stdout } = await execFileAsync(
    "curl",
    ["-sS", "--fail-with-body", "--max-time", "45", ...args],
    { maxBuffer: 1024 * 1024 * 8 },
  );
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Non-JSON response from music API: ${stdout.slice(0, 300)}`);
  }
}

export interface CreateTaskParams {
  title: string;
  style: string;
  prompt: string;
  negativeTags: string;
  /** Target length in seconds. Only honoured by V6-family models. */
  durationSec?: number;
}


/**
 * custom_mode false on purpose. In custom mode the provider treats `prompt`
 * strictly as the lyric sheet and sings it verbatim — which is how a guest's
 * souvenir once sang our own creative brief back at them. Here `prompt` is the
 * core idea and the provider writes the lyrics.
 */
const CUSTOM_MODE = false;

export async function createMusicTask(p: CreateTaskParams): Promise<string> {
  const input: Record<string, unknown> = {
    prompt: p.prompt,
    style: p.style,
    title: p.title,
    custom_mode: CUSTOM_MODE,
    instrumental: false,
    model: "V6",
    negative_tags: p.negativeTags,
  };

  // The provider rejects the whole request when `duration` is present outside
  // custom mode: "duration is only supported when customMode is true". So it is
  // sent only when it is legal, rather than always. Outside custom mode the
  // model chooses the length, which has been landing around two minutes anyway.
  if (CUSTOM_MODE) {
    input.duration = p.durationSec ?? 120;
  }

  const body = { model: MODEL, input };

  const json = await curlWithBody(endpoint(CREATE_PATH), JSON.stringify(body));

  const taskId = json?.data?.taskId;
  if (!taskId) {
    throw new Error(json?.msg || "Music API did not return a task id");
  }
  return taskId as string;
}

/** POSTs a JSON body via stdin so it never appears in the process argument list. */
async function curlWithBody(url: string, body: string): Promise<any> {
  const child = execFile("curl", [
    "-sS",
    "--fail-with-body",
    "--max-time",
    "45",
    "-X",
    "POST",
    url,
    ...authArgs(),
    "-H",
    "Content-Type: application/json",
    "--data-binary",
    "@-",
  ]);

  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(err || `Non-JSON response: ${out.slice(0, 300)}`));
      }
    });
    child.stdin?.end(body);
  });
}

export type TaskState = "waiting" | "queuing" | "generating" | "success" | "fail";

export interface TaskResult {
  state: TaskState;
  audioUrl?: string;
  streamUrl?: string;
  imageUrl?: string;
  lyrics?: string;
  durationSec?: number;
  failMessage?: string;
}

/**
 * Pulls real lyrics out of a result, and refuses anything that is merely our own
 * prompt handed back.
 *
 * This guard exists because of a specific bug: the souvenir page once showed an
 * attendee our creative brief, instruction sentences and all, because the field
 * that looked like lyrics was an echo of our input. A lyric sheet has section
 * tags or line breaks; a brief is one block of prose. If it does not look sung,
 * it does not get shown.
 */
function looksLikeLyrics(text: unknown): text is string {
  if (typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < 40) return false;
  if (/\[(verse|chorus|bridge|intro|outro|pre-chorus|hook)/i.test(t)) return true;
  return t.split(/\n/).filter((l) => l.trim().length > 0).length >= 4;
}

function pickLyrics(item: any): string | undefined {
  for (const candidate of [item?.lyrics, item?.prompt]) {
    if (looksLikeLyrics(candidate)) return candidate.trim();
  }
  return undefined;
}

/**
 * Polls one task. The provider returns results as a JSON *string* in
 * `resultJson`, and the music models nest tracks under `sunoData` while other
 * market models use a flat `resultUrls` array — both shapes are handled.
 */
export async function getTaskResult(taskId: string): Promise<TaskResult> {
  const json = await curlJson([
    `${endpoint(RECORD_PATH)}?taskId=${encodeURIComponent(taskId)}`,
    ...authArgs(),
  ]);
  const data = json?.data ?? {};
  const state: TaskState = data.state ?? "generating";

  if (state === "fail") {
    return { state, failMessage: data.failMsg || data.failCode || "Generation failed" };
  }
  if (state !== "success") return { state };

  let parsed: any = {};
  try {
    parsed = typeof data.resultJson === "string" ? JSON.parse(data.resultJson) : data.resultJson ?? {};
  } catch {
    parsed = {};
  }

  const first = parsed?.sunoData?.[0] ?? parsed?.data?.[0] ?? null;
  const audioUrl: string | undefined =
    first?.audioUrl ?? first?.audio_url ?? parsed?.resultUrls?.[0] ?? undefined;

  if (!audioUrl) {
    return { state: "fail", failMessage: "Job succeeded but returned no audio URL" };
  }

  return {
    state: "success",
    audioUrl,
    streamUrl: first?.streamAudioUrl ?? first?.stream_audio_url ?? undefined,
    imageUrl: first?.imageUrl ?? first?.image_url ?? undefined,
    // `first.prompt` is an echo of our own input, NOT a lyric sheet — never map
    // it here or the attendee is shown the instructions we sent the model.
    lyrics: pickLyrics(first),
    // Floor, not round: the <audio> element reports whole seconds elapsed, so
    // rounding up makes the credits disagree with the player by a second.
    durationSec: first?.duration ? Math.floor(Number(first.duration)) : undefined,
  };
}

/** Remaining account credits — surfaced on the operator dashboard. */
export async function getCredits(): Promise<number | null> {
  try {
    const json = await curlJson([endpoint(CREDIT_PATH), ...authArgs()]);
    const v = json?.data;
    return typeof v === "number" ? v : typeof v?.credit === "number" ? v.credit : null;
  } catch {
    return null;
  }
}
