import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.CLAUDE_CODE_BIN ?? "/Users/agentzero/.local/bin/claude";
const DEFAULT_MODEL = process.env.SF_EVENTS_CLAUDE_MODEL ?? "sonnet";

interface RunOpts {
  prompt: string;
  /** Whitelist of CC tools — empty array disables all (cheap/fast text-only mode). */
  allowedTools?: string[];
  /** Per-call timeout in ms (default 5 min) */
  timeoutMs?: number;
  /** Model alias — defaults to "sonnet" (override via SF_EVENTS_CLAUDE_MODEL). */
  model?: string;
}

const ALL_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "WebSearch",
  "WebFetch",
  "Grep",
  "Glob",
  "Task",
  "TodoWrite",
];

/**
 * Invokes Claude Code CLI in non-interactive mode and returns the assistant's
 * final result text. Prompt is sent via stdin to avoid argv length / quoting issues.
 */
export async function runClaudeCode({
  prompt,
  allowedTools = [],
  timeoutMs = 300_000,
  model = DEFAULT_MODEL,
}: RunOpts): Promise<string> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--no-session-persistence",
    "--model",
    model,
  ];

  if (allowedTools.length > 0) {
    args.push("--allowedTools", allowedTools.join(" "));
    const denied = ALL_TOOLS.filter((t) => !allowedTools.includes(t));
    if (denied.length > 0) args.push("--disallowedTools", denied.join(" "));
  } else {
    args.push("--disallowedTools", ALL_TOOLS.join(" "));
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");

      if (code !== 0 && stdout.trim().length === 0) {
        reject(new Error(`Claude CLI exit ${code}: ${stderr.slice(-500)}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        // --output-format json may yield: array of stream messages, or single result object.
        if (Array.isArray(parsed)) {
          const result = parsed.find(
            (m: { type?: string }) => m && m.type === "result"
          );
          if (result?.is_error) {
            reject(new Error(`Claude CLI error: ${result.result ?? "unknown"}`));
            return;
          }
          resolve(result?.result ?? "");
          return;
        }
        if (parsed.is_error) {
          reject(new Error(`Claude CLI error: ${parsed.error ?? parsed.result ?? "unknown"}`));
          return;
        }
        resolve(parsed.result ?? "");
      } catch (e) {
        reject(
          new Error(
            `Claude CLI: failed to parse stdout (${(e as Error).message}). stderr: ${stderr.slice(-300)}`
          )
        );
      }
    });

    child.stdin.end(prompt, "utf8");
  });
}

/** Extract the first JSON array from arbitrary text. */
export function extractJsonArray<T = unknown>(text: string): T[] {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fallthrough */
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fallthrough */
    }
  }

  const m = trimmed.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fallthrough */
    }
  }

  return [];
}

/** Extract the first JSON object from arbitrary text. */
export function extractJsonObject<T = unknown>(text: string): T | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* fallthrough */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      /* fallthrough */
    }
  }
  const m = trimmed.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      /* fallthrough */
    }
  }
  return null;
}
