// LiveKit server-side client: dispatches the voice agent for an outbound call.
//
// Outbound flow (per LiveKit docs): the app creates an *agent dispatch* into a
// fresh room with the call details as metadata; the agent worker then places the
// PSTN call (createSipParticipant) and runs the conversation. So this module only
// dispatches — the worker (src/agent/event-caller.ts) does the dialing.

import { AgentDispatchClient, AccessToken } from "livekit-server-sdk";

export const AGENT_NAME = "event-caller";
export const REVIEW_AGENT_NAME = "review-agent";

export interface LiveKitConfig {
  url: string; // wss://...
  httpUrl: string; // https://... (server SDK)
  apiKey: string;
  apiSecret: string;
}

export function getLiveKitConfig(): LiveKitConfig | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  const httpUrl = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  return { url, httpUrl, apiKey, apiSecret };
}

export interface EventCallMetadata {
  callId: number;
  phone: string;
  eventTitle: string;
  eventSummary: string;
  score: number | null;
}

/**
 * Dispatch the event-caller agent into a fresh room. Returns the room name.
 * Throws if LiveKit isn't configured (caller records the failure).
 */
export async function dispatchEventCall(meta: EventCallMetadata): Promise<string> {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit not configured (LIVEKIT_URL/API_KEY/API_SECRET)");

  const roomName = `call-${meta.callId}-${Date.now()}`;
  const client = new AgentDispatchClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  await client.createDispatch(roomName, AGENT_NAME, {
    metadata: JSON.stringify(meta),
  });
  return roomName;
}

// --- Browser voice review (WebRTC, no SIP) -------------------------------------

/** Mint a browser access token to join a room with mic + data. */
export async function mintAccessToken(room: string, identity: string): Promise<string> {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit not configured");
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity, ttl: "1h" });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}

/** Dispatch the review agent into a room, passing the event queue as metadata. */
export async function dispatchReviewAgent(room: string, metadata: object): Promise<void> {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit not configured");
  const client = new AgentDispatchClient(cfg.httpUrl, cfg.apiKey, cfg.apiSecret);
  await client.createDispatch(room, REVIEW_AGENT_NAME, { metadata: JSON.stringify(metadata) });
}
