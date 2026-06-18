// Plain HTTP GET — the cheap first attempt before spending a Web Unlocker call.
//
// Many venue/listing sites (Funcheap, Manny's, KQED, Daybreaker, …) aren't
// bot-protected: a normal browser-like request returns byte-for-byte the same
// HTML Web Unlocker does. We try this first and only fall back to the (paid)
// unlocker when the response looks blocked or empty. Returns a `BdCall` (product
// `direct_fetch`, $0) so the attempt still shows up in the usage audit trail.

import { BdCall, errMsg, makeCall } from "@/lib/brightdata/types";

export interface DirectFetchResult {
  content: string;
  call: BdCall;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** GET a URL with browser-like headers. Never throws. */
export async function fetchDirect(url: string, timeoutMs = 25_000): Promise<DirectFetchResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await res.text();
    return {
      content: body,
      call: makeCall("direct_fetch", "fetch", url, {
        ok: res.ok,
        httpStatus: res.status,
        bytes: Buffer.byteLength(body),
        credits: 0,
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        errorMessage: res.ok ? null : `HTTP ${res.status}`,
      }),
    };
  } catch (err) {
    return {
      content: "",
      call: makeCall("direct_fetch", "fetch", url, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage: errMsg(err),
      }),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Heuristic: is a direct-fetch body good enough to skip Web Unlocker? Rejects
 * tiny bodies and obvious block / bot-challenge / CAPTCHA interstitials so those
 * fall through to the unlocker.
 */
export function looksUsable(content: string): boolean {
  if (!content || content.length < 2_000) return false;
  const head = content.slice(0, 4_000).toLowerCase();
  return !/(captcha|are you a (human|robot)|access denied|request blocked|cf-browser-verification|just a moment\.\.\.|enable javascript and cookies)/.test(
    head
  );
}
