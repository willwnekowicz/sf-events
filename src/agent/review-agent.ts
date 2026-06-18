// LiveKit voice agent worker: "review-agent".
//
// Browser voice (WebRTC, no phone). The user opens /dashboard/review and talks
// through new events one at a time. This agent narrates each event tersely,
// records like/dislike + a spoken note (which feeds the preference profile), and
// advances on "next".
//
// State is SERVER-AUTHORITATIVE: the cursor lives in the app (src/lib/review-state)
// and BOTH this agent and the browser poll it, so the card on screen and the
// agent's narration never drift apart.
//
// Run:  npm run agent   (tsx src/agent/review-agent.ts dev)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function loadEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of [".env.local", ".env.openai"]) {
    const p = resolve(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}
loadEnv();

import { type JobContext, WorkerOptions, cli, defineAgent, llm, voice, waitForParticipant } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { z } from "zod";

const APP_URL = process.env.APP_URL ?? "http://localhost:3010";

interface ReviewEvent {
  id: number;
  title: string;
  venue: string;
  date: string;
  time: string | null;
  description: string | null;
  price: string | null;
  relevanceScore: number | null;
  url: string | null;
}
interface ReviewState {
  cursor: number;
  announced: number;
  total: number;
  finished: boolean;
  currentEventId: number | null;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || "{}") as { room: string; events: ReviewEvent[] };
    const room = meta.room;
    const events = meta.events ?? [];
    console.log(`[review-agent] starting, room=${room}, ${events.length} events`);

    await ctx.connect();
    await waitForParticipant({ room: ctx.room });

    // Pipeline (STT → LLM → TTS) rather than the realtime model: lets us speak
    // event lines verbatim via session.say() (deterministic + terse) while the
    // LLM still understands spoken feedback. All on the one OpenAI key.
    const session = new voice.AgentSession({
      vad: await silero.VAD.load(),
      stt: new openai.STT({ model: "whisper-1" }),
      llm: new openai.LLM({ model: "gpt-4o-mini" }),
      tts: new openai.TTS({ voice: "alloy", speed: 1.3 }),
    });

    const weekday = (dateStr: string) => {
      try {
        return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
      } catch {
        return dateStr;
      }
    };
    // Deterministic, terse spoken line — said verbatim so the model can't ramble.
    const line = (e: ReviewEvent) =>
      `${e.title}. ${e.venue}, ${weekday(e.date)}${e.price ? `, ${e.price}` : ""}. Thoughts?`;

    // --- server comms --------------------------------------------------------
    const post = async (path: string, body: unknown) => {
      try {
        const r = await fetch(`${APP_URL}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return r.ok;
      } catch (e) {
        console.error("[review-agent]", path, "failed:", e);
        return false;
      }
    };
    const fetchState = async (): Promise<ReviewState | null> => {
      try {
        const r = await fetch(`${APP_URL}/api/review/state?room=${encodeURIComponent(room)}`);
        if (r.ok) return (await r.json()) as ReviewState;
      } catch {
        /* ignore */
      }
      return null;
    };

    // --- deterministic serial narration --------------------------------------
    // Present exactly one line at a time and AWAIT it to finish, so the agent
    // never talks over itself. Report the index being narrated so the UI card
    // mirrors the agent precisely.
    let announced = -1;
    let busy = false;
    let pendingAdvance: ReturnType<typeof setTimeout> | null = null;

    const doAdvance = async () => {
      if (pendingAdvance) {
        clearTimeout(pendingAdvance);
        pendingAdvance = null;
      }
      await post("/api/review/next", { room });
    };
    const scheduleAdvance = (ms: number) => {
      if (pendingAdvance) clearTimeout(pendingAdvance);
      pendingAdvance = setTimeout(() => {
        pendingAdvance = null;
        void doAdvance();
      }, ms);
    };

    const present = async (target: number) => {
      busy = true;
      announced = target;
      try {
        await post("/api/review/agent", { room, action: "announce", index: target });
        const text = target >= events.length ? "That's all for now — thanks!" : line(events[target]);
        await session.say(text, { allowInterruptions: false }).waitForPlayout();
        if (target >= events.length) await post("/api/review/agent", { room, action: "finish" });
      } catch (e) {
        console.error("[review-agent] present failed:", e);
      } finally {
        busy = false;
      }
    };

    const loop = async () => {
      if (busy) return;
      const st = await fetchState();
      if (!st || st.finished) return;
      const target = Math.min(st.cursor, events.length);
      if (target > announced) await present(target);
    };

    // --- tools ---------------------------------------------------------------
    const recordFeedback = llm.tool({
      description:
        "Record the user's like/dislike about the event currently being discussed. Call whenever they express any opinion. Do not advance yourself.",
      parameters: z.object({
        sentiment: z.enum(["like", "dislike"]).describe("did they like or dislike it"),
        note: z.string().describe("short summary, in their words, of what they liked/disliked"),
      }),
      execute: async ({ sentiment, note }) => {
        await post("/api/review/feedback", { room, sentiment, note });
        scheduleAdvance(2000); // brief beat so the user sees it land, then move on
        return "ok";
      },
    });

    const nextEvent = llm.tool({
      description: "Advance to the next event. Call only when the user says 'next' / 'skip' with no opinion.",
      parameters: z.object({}),
      execute: async () => {
        await doAdvance();
        return "ok";
      },
    });

    const agent = new voice.Agent({
      instructions:
        `You help the user speed-review events by voice. The APP speaks each event for you — NEVER introduce, ` +
        `describe, re-read, or greet. Only listen. When the user expresses ANY opinion, call record_feedback ` +
        `(like/dislike + their words). When they say "next" or "skip" with no opinion, call next_event. After ANY ` +
        `tool call, say nothing at all — the app speaks the next event. Never speak unprompted.`,
      tools: { record_feedback: recordFeedback, next_event: nextEvent },
    });

    await session.start({ agent, room: ctx.room });

    const poll = setInterval(() => void loop(), 350);
    ctx.addShutdownCallback(async () => {
      clearInterval(poll);
      if (pendingAdvance) clearTimeout(pendingAdvance);
    });
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "review-agent",
  })
);
