import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask";
const RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo";
const MODEL = "ai-music-api/generate";

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

  const json = await curlWithBody(CREATE_URL, JSON.stringify(body));

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
  const json = await curlJson([`${RECORD_URL}?taskId=${encodeURIComponent(taskId)}`]);
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
    lyrics: first?.prompt ?? first?.lyrics ?? undefined,
    durationSec: first?.duration ? Math.round(Number(first.duration)) : undefined,
  };
}

/** Remaining account credits — surfaced on the operator dashboard. */
export async function getCredits(): Promise<number | null> {
  try {
    const json = await curlJson(["https://api.kie.ai/api/v1/chat/credit"]);
    const v = json?.data;
    return typeof v === "number" ? v : typeof v?.credit === "number" ? v.credit : null;
  } catch {
    return null;
  }
}
