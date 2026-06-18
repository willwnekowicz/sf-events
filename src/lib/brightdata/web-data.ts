// Bright Data Web Data (structured datasets). Facebook is near-impossible to
// scrape raw, but the "Facebook — Events by URL" dataset returns clean,
// pre-parsed event JSON — no LLM required.
//
// Flow: trigger a collection → poll for the snapshot → download records.

import { bdDatasetFetch, getConfig } from "./client";
import { BdCall, CREDITS, errMsg, makeCall, USD_PER_CREDIT } from "./types";

export interface WebDataResult {
  records: Array<Record<string, unknown>>;
  call: BdCall;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Collect events for a Facebook events URL. Bounded polling (~90s); if the
 * snapshot isn't ready in time it returns a failed call rather than hanging the
 * whole scrape cycle. Never throws.
 */
export async function facebookEvents(
  url: string,
  opts: { maxWaitMs?: number } = {}
): Promise<WebDataResult> {
  const cfg = getConfig();
  const startedAt = Date.now();

  if (!cfg) {
    return {
      records: [],
      call: makeCall("web_data", "facebook_events", url, {
        ok: false,
        errorMessage: "Bright Data not configured (BRIGHTDATA_API_TOKEN missing)",
      }),
    };
  }

  const maxWaitMs = opts.maxWaitMs ?? 90_000;
  try {
    // 1) Trigger a collection for this URL.
    const trigRes = await bdDatasetFetch(
      `/datasets/v3/trigger?dataset_id=${encodeURIComponent(cfg.fbEventsDatasetId)}&include_errors=true`,
      { method: "POST", body: JSON.stringify([{ url }]) }
    );
    const trigText = await trigRes.text();
    if (!trigRes.ok) {
      throw new Error(`trigger ${trigRes.status}: ${trigText.slice(0, 200)}`);
    }
    const snapshotId = (JSON.parse(trigText) as { snapshot_id?: string }).snapshot_id;
    if (!snapshotId) throw new Error(`no snapshot_id in trigger response: ${trigText.slice(0, 200)}`);

    // 2) Poll progress until ready (or we run out of time).
    const deadline = startedAt + maxWaitMs;
    while (Date.now() < deadline) {
      await sleep(3000);
      const progRes = await bdDatasetFetch(`/datasets/v3/progress/${snapshotId}`);
      const prog = (await progRes.json().catch(() => ({}))) as { status?: string };
      if (prog.status === "ready") break;
      if (prog.status === "failed") throw new Error("dataset collection failed");
    }

    // 3) Download the snapshot records.
    const snapRes = await bdDatasetFetch(`/datasets/v3/snapshot/${snapshotId}?format=json`);
    if (snapRes.status === 202) {
      throw new Error(`snapshot still running after ${Math.round(maxWaitMs / 1000)}s`);
    }
    const snapText = await snapRes.text();
    if (!snapRes.ok) throw new Error(`snapshot ${snapRes.status}: ${snapText.slice(0, 200)}`);
    const parsed = JSON.parse(snapText);
    const records: Array<Record<string, unknown>> = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown[] }).data)
        ? ((parsed as { data: Array<Record<string, unknown>> }).data)
        : [];

    const credits = CREDITS.web_data * Math.max(records.length, 1);
    return {
      records,
      call: makeCall("web_data", "facebook_events", url, {
        ok: true,
        httpStatus: 200,
        bytes: Buffer.byteLength(snapText),
        credits,
        costUsd: credits * USD_PER_CREDIT,
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (err) {
    return {
      records: [],
      call: makeCall("web_data", "facebook_events", url, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage: errMsg(err),
      }),
    };
  }
}
