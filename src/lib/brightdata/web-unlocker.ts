// Bright Data Web Unlocker — fetches bot-protected pages as real HTML.
// Replaces the app's plain fetch(), which gets 403'd / JS-shelled on most
// event platforms (Eventbrite, lu.ma, Funcheap, KQED, …).

import { bdRequest, getConfig } from "./client";
import { BdCall, CREDITS, errMsg, makeCall, USD_PER_CREDIT } from "./types";

export interface UnlockResult {
  content: string;
  call: BdCall;
}

/**
 * Unlock a single URL. Never throws — operational failures (not configured,
 * blocked, timeout) come back as `{ content: "", call: { ok: false, ... } }`
 * so the pipeline can record the failed Bright Data call and move on.
 */
export async function unlock(url: string): Promise<UnlockResult> {
  const cfg = getConfig();
  const startedAt = Date.now();

  if (!cfg) {
    return {
      content: "",
      call: makeCall("web_unlocker", "unlock", url, {
        ok: false,
        durationMs: 0,
        errorMessage: "Bright Data not configured (BRIGHTDATA_API_TOKEN missing)",
      }),
    };
  }

  try {
    const { body, httpStatus, bytes, costUsd } = await bdRequest({
      zone: cfg.unlockerZone,
      url,
      format: "raw",
    });
    return {
      content: body,
      call: makeCall("web_unlocker", "unlock", url, {
        ok: true,
        httpStatus,
        bytes,
        credits: CREDITS.web_unlocker,
        costUsd: costUsd || CREDITS.web_unlocker * USD_PER_CREDIT,
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (err) {
    return {
      content: "",
      call: makeCall("web_unlocker", "unlock", url, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage: errMsg(err),
      }),
    };
  }
}
