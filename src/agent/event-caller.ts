// LiveKit voice agent worker: "event-caller".
//
// Dispatched by the Next app (src/lib/livekit/client.ts) with event details as
// job metadata. It places an outbound PSTN call (LiveKit Phone Numbers → SIP),
// runs an OpenAI Realtime conversation that summarizes the event and asks which
// friends might want to go, and reports the captured names back to the app.
//
// Run:  npm run agent   (tsx src/agent/event-caller.ts dev)

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// --- env: this runs outside Next, so load .env.local + .env.openai ourselves ---
function loadEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of [".env.local", ".env.openai"]) {
    const p = resolve(root, file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

import { type JobContext, WorkerOptions, cli, defineAgent, llm, voice } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { SipClient } from "livekit-server-sdk";
import { z } from "zod";

const APP_URL = process.env.APP_URL ?? "http://localhost:3010";

async function patchStatus(callId: number, status: string, errorMessage?: string) {
  try {
    await fetch(`${APP_URL}/api/calls/${callId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, errorMessage }),
    });
  } catch (e) {
    console.error("[event-caller] patchStatus failed:", e);
  }
}

async function postResult(callId: number, body: { friends?: string[]; transcript?: string }) {
  try {
    await fetch(`${APP_URL}/api/calls/${callId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[event-caller] postResult failed:", e);
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = JSON.parse(ctx.job.metadata || "{}") as {
      callId: number;
      phone: string;
      eventTitle: string;
      eventSummary: string;
      score: number | null;
    };
    const { callId, phone, eventTitle, eventSummary } = meta;
    console.log(`[event-caller] job for call ${callId} → ${phone} (${eventTitle})`);

    await ctx.connect();

    // 1) Place the outbound call into this room.
    const trunkId = process.env.SIP_OUTBOUND_TRUNK_ID;
    if (!trunkId) {
      await patchStatus(callId, "failed", "SIP_OUTBOUND_TRUNK_ID not set (provision a LiveKit phone number)");
      return;
    }
    const sip = new SipClient(
      (process.env.LIVEKIT_URL ?? "").replace(/^wss:\/\//, "https://"),
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );

    await patchStatus(callId, "ringing");
    try {
      await sip.createSipParticipant(trunkId, phone, ctx.room.name ?? ctx.job.room?.name ?? "", {
        participantIdentity: "phone_user",
        participantName: "You",
        waitUntilAnswered: true,
        krispEnabled: true,
        ringingTimeout: 30,
        maxCallDuration: 180,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[event-caller] dial failed:", msg);
      await patchStatus(callId, "failed", `Dial failed: ${msg}`);
      return;
    }
    await patchStatus(callId, "in_progress");

    // 2) Capture friends named on the call.
    const recordFriends = llm.tool({
      description:
        "Record the names of friends the user wants to check with about this event. Call this whenever the user names one or more friends.",
      parameters: z.object({
        friends: z.array(z.string()).describe("First names (or names) of friends the user mentioned"),
      }),
      execute: async ({ friends }) => {
        console.log(`[event-caller] friends for call ${callId}:`, friends);
        await postResult(callId, { friends });
        return `Got it — noted ${friends.join(", ")}.`;
      },
    });

    // 3) Realtime voice session.
    const agent = new voice.Agent({
      instructions:
        `You are a warm, upbeat personal assistant calling the user about an event you think they'll love. ` +
        `Keep the whole call under about 45 seconds and sound natural on the phone.\n\n` +
        `THE EVENT: ${eventSummary}\n\n` +
        `Do this in order:\n` +
        `1. Briefly greet them and say you found an event they'd really like.\n` +
        `2. Summarize the event in one or two sentences (what, where, when).\n` +
        `3. Ask which friends they'd want to check with who might want to go.\n` +
        `4. When they mention any friends, call the record_friends tool with those names.\n` +
        `5. Thank them and say goodbye. Do not ask follow-up questions after recording friends.`,
      tools: { record_friends: recordFriends },
    });

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({ voice: "alloy" }),
    });

    // Mark completed when the human hangs up.
    ctx.room.on("participantDisconnected", async () => {
      await patchStatus(callId, "completed");
    });
    ctx.addShutdownCallback(async () => {
      await patchStatus(callId, "completed");
    });

    await session.start({ agent, room: ctx.room });

    // Kick off the conversation.
    session.generateReply({
      instructions: "Greet the user and start telling them about the event right away.",
    });
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: "event-caller",
  })
);
