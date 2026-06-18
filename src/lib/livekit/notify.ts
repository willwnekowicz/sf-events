// Detection + call-placement for hot events.

import { db } from "@/db";
import { eventCalls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dispatchEventCall } from "./client";

export interface CallableEvent {
  id: number | null;
  title: string;
  venue?: string | null;
  date?: string | null;
  time?: string | null;
  description?: string | null;
  price?: string | null;
  relevanceScore?: number | null;
}

export function callThreshold(): number {
  return parseInt(process.env.SF_EVENTS_CALL_THRESHOLD ?? "90", 10);
}

export function callsEnabled(): boolean {
  return process.env.SF_EVENTS_ENABLE_CALLS === "1";
}

/** Spoken-summary raw material handed to the agent (it phrases it naturally). */
export function buildSummary(e: CallableEvent): string {
  const parts = [e.title];
  if (e.venue) parts.push(`at ${e.venue}`);
  if (e.date) parts.push(`on ${e.date}${e.time ? ` at ${e.time}` : ""}`);
  let s = parts.join(" ");
  if (e.price) s += ` (${e.price})`;
  if (e.description) s += `. ${e.description}`;
  if (e.relevanceScore != null) s += ` Relevance score: ${e.relevanceScore}/100.`;
  return s;
}

/**
 * Core: record a call row and dispatch the agent. Used by both the auto trigger
 * and the manual test endpoint. On dispatch failure the row is marked `failed`
 * with a readable reason (never throws).
 */
export async function startCallForEvent(
  e: CallableEvent,
  opts: { phone?: string } = {}
): Promise<number> {
  const phone = opts.phone ?? process.env.MY_PHONE_NUMBER ?? "";
  const summary = buildSummary(e);

  const [row] = await db
    .insert(eventCalls)
    .values({
      eventId: e.id,
      phone,
      status: "initiated",
      eventTitle: e.title,
      eventSummary: summary,
      score: e.relevanceScore ?? null,
      createdAt: new Date().toISOString(),
    })
    .returning({ id: eventCalls.id });
  const callId = row.id;

  try {
    if (!phone) throw new Error("No phone number configured (MY_PHONE_NUMBER)");
    const roomName = await dispatchEventCall({
      callId,
      phone,
      eventTitle: e.title,
      eventSummary: summary,
      score: e.relevanceScore ?? null,
    });
    await db
      .update(eventCalls)
      .set({ roomName, startedAt: new Date().toISOString() })
      .where(eq(eventCalls.id, callId));
    console.log(`[calls] dispatched call ${callId} for "${e.title}" → room ${roomName}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db
      .update(eventCalls)
      .set({ status: "failed", errorMessage, finishedAt: new Date().toISOString() })
      .where(eq(eventCalls.id, callId));
    console.error(`[calls] dispatch failed for call ${callId}:`, errorMessage);
  }
  return callId;
}

/**
 * Auto path: called from the scrape pipeline for newly inserted events. Guards on
 * the enable flag, the score threshold, and dedupes so a given event is only ever
 * called about once.
 */
export async function maybeCallAboutEvent(e: CallableEvent): Promise<number | null> {
  if (!callsEnabled()) return null;
  if (e.relevanceScore == null || e.relevanceScore < callThreshold()) return null;
  if (!process.env.MY_PHONE_NUMBER) return null;

  if (e.id != null) {
    const existing = await db
      .select({ id: eventCalls.id })
      .from(eventCalls)
      .where(eq(eventCalls.eventId, e.id))
      .limit(1);
    if (existing.length > 0) return null; // already called about this event
  }
  return startCallForEvent(e);
}
