import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const API_ORIGIN = "https://api.kie.ai";
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
const PASS_THROUGH_URL = process.env.CUSTOM_CRED_API_KIE_AI_URL;
const PASS_THROUGH_KEY = process.env.CUSTOM_CRED_API_KIE_AI_PROXY_AUTH_KEY;
const USE_PASS_THROUGH = Boolean(PASS_THROUGH_URL && PASS_THROUGH_KEY);

/** Resolves an API path to a callable URL for whichever transport is active. */
function endpoint(path: string): string {
  if (USE_PASS_THROUGH) {
    return `${PASS_THROUGH_URL!.replace(/\/$/, "")}${path}`;
  }
  return `${API_ORIGIN}${path}`;
}

/** Auth headers required by the active transport, as curl arguments. */
function authArgs(): string[] {
  return USE_PASS_THROUGH ? ["-H", `x-api-key: ${PASS_THROUGH_KEY}`] : [];
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

/** Submits the generation job and returns the provider task id. */
export async function createMusicTask(p: CreateTaskParams): Promise<string> {
  const body = {
    model: MODEL,
    input: {
      prompt: p.prompt,
      style: p.style,
      title: p.title,
      custom_mode: true,
      instrumental: false,
      model: "V6",
      negative_tags: p.negativeTags,
      duration: p.durationSec ?? 120,
    },
  };

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
    lyrics: first?.lyrics ?? undefined,
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
