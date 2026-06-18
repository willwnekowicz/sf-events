// Server-authoritative state for a voice-review session — the single source of
// truth shared by the browser UI and the agent worker.
//
// Determinism model:
//   - `cursor`     = the advance position. It only increments when the agent has
//                    caught up (`cursor === announced`), so rapid/duplicate
//                    advance requests can never skip an event.
//   - `announced`  = the index the agent is CURRENTLY narrating. The UI displays
//                    this (not `cursor`), so the card always matches what the
//                    agent is saying.
// Kept in-process, pinned to globalThis so Next HMR reloads don't drop sessions.

import { db } from "@/db";
import { interactions } from "@/db/schema";

export interface ReviewEventLite {
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

interface Session {
  events: ReviewEventLite[];
  cursor: number; // advance target
  announced: number; // index the agent is currently narrating (-1 = none yet)
  finished: boolean;
  feedback: Record<number, { sentiment: "like" | "dislike"; note: string }>;
  createdAt: number;
}

const G = globalThis as unknown as { __reviewSessions?: Map<string, Session> };
const sessions = (G.__reviewSessions ??= new Map<string, Session>());

export function createSession(room: string, events: ReviewEventLite[]) {
  sessions.set(room, { events, cursor: 0, announced: -1, finished: false, feedback: {}, createdAt: Date.now() });
}

export function getState(room: string) {
  const s = sessions.get(room);
  if (!s) return null;
  const onEvent = s.announced >= 0 && s.announced < s.events.length;
  return {
    cursor: s.cursor,
    announced: s.announced,
    total: s.events.length,
    finished: s.finished,
    currentEventId: onEvent ? s.events[s.announced].id : null,
    feedback: s.feedback,
  };
}

/** Advance — but only if the agent has caught up to the current cursor. */
export function advance(room: string) {
  const s = sessions.get(room);
  if (!s) return null;
  if (!s.finished && s.cursor === s.announced && s.cursor < s.events.length) {
    s.cursor++;
  }
  return getState(room);
}

/** The agent reports the event it has started narrating. */
export function setAnnounced(room: string, index: number) {
  const s = sessions.get(room);
  if (!s) return null;
  s.announced = index;
  return getState(room);
}

export function finish(room: string) {
  const s = sessions.get(room);
  if (!s) return null;
  s.finished = true;
  return getState(room);
}

/** Record like/dislike + note for the event the agent is CURRENTLY narrating. */
export async function recordFeedback(room: string, sentiment: "like" | "dislike", note: string) {
  const s = sessions.get(room);
  if (!s) return null;
  const e = s.events[s.announced];
  if (!e) return null;
  s.feedback[e.id] = { sentiment, note };
  await db.insert(interactions).values({
    eventId: e.id,
    action: sentiment === "like" ? "thumbs_up" : "thumbs_down",
    note: note?.trim() ? note.trim() : null,
    createdAt: new Date().toISOString(),
  });
  return e.id;
}
