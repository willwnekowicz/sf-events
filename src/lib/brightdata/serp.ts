// Bright Data SERP API — structured search results, replacing the broken
// Claude WebSearch used for `platform` sources. Uses the same /request endpoint
// with `brd_json=1`, which returns parsed JSON instead of a raw SERP page.

import { bdRequest, getConfig } from "./client";
import { BdCall, CREDITS, errMsg, makeCall, USD_PER_CREDIT } from "./types";

export interface SerpOrganic {
  title: string;
  url: string;
  snippet: string | null;
  rank: number;
}

export interface SerpResult {
  results: SerpOrganic[];
  call: BdCall;
}

function buildSearchUrl(engine: "google" | "bing", query: string, num: number): string {
  const q = encodeURIComponent(query);
  if (engine === "bing") {
    return `https://www.bing.com/search?q=${q}&count=${num}&brd_json=1`;
  }
  return `https://www.google.com/search?q=${q}&num=${num}&brd_json=1`;
}

/** Parse the `brd_json=1` SERP payload into organic results, defensively. */
function parseSerp(body: string): SerpOrganic[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  const organic =
    (json as { organic?: unknown[] })?.organic ??
    (json as { results?: { organic?: unknown[] } })?.results?.organic ??
    [];
  if (!Array.isArray(organic)) return [];
  return organic
    .map((o, i) => {
      const row = o as Record<string, unknown>;
      const url = (row.link ?? row.url ?? row.href) as string | undefined;
      const title = (row.title ?? row.name) as string | undefined;
      if (!url || !title) return null;
      return {
        title: String(title),
        url: String(url),
        snippet: (row.description ?? row.snippet ?? null) as string | null,
        rank: typeof row.rank === "number" ? (row.rank as number) : i + 1,
      } satisfies SerpOrganic;
    })
    .filter((x): x is SerpOrganic => x !== null);
}

/** Run a search. Never throws — failures come back as a failed BdCall. */
export async function search(
  query: string,
  opts: { num?: number; engine?: "google" | "bing" } = {}
): Promise<SerpResult> {
  const cfg = getConfig();
  const num = opts.num ?? 15;
  const engine = opts.engine ?? "google";
  const searchUrl = buildSearchUrl(engine, query, num);
  const startedAt = Date.now();

  if (!cfg) {
    return {
      results: [],
      call: makeCall("serp", "search", searchUrl, {
        ok: false,
        errorMessage: "Bright Data not configured (BRIGHTDATA_API_TOKEN missing)",
      }),
    };
  }

  try {
    const { body, httpStatus, bytes, costUsd } = await bdRequest({
      zone: cfg.serpZone,
      url: searchUrl,
      format: "raw",
    });
    const results = parseSerp(body).slice(0, num);
    return {
      results,
      call: makeCall("serp", "search", searchUrl, {
        ok: true,
        httpStatus,
        bytes,
        credits: CREDITS.serp,
        costUsd: costUsd || CREDITS.serp * USD_PER_CREDIT,
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (err) {
    return {
      results: [],
      call: makeCall("serp", "search", searchUrl, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage: errMsg(err),
      }),
    };
  }
}
