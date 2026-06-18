// Shared types + helpers for the Bright Data client layer.
//
// Every Bright Data network attempt produces a `BdCall` record — success OR
// failure — so the scrape-status dashboard can show an exact, per-product audit
// trail (calls, bytes, credits, errors). The pipeline persists these into the
// `scrape_bd_calls` table.

// `direct_fetch` is a plain HTTP GET (no Bright Data) — recorded in the same
// audit trail at $0 so the dashboard shows when a source skipped Web Unlocker.
export type BdProduct = "web_unlocker" | "serp" | "scraping_browser" | "web_data" | "direct_fetch";

export interface BdCall {
  product: BdProduct;
  operation: string; // 'unlock' | 'search' | 'navigate' | 'facebook_events' ...
  url: string | null;
  httpStatus: number | null;
  bytes: number | null;
  credits: number;
  /** Actual USD cost, read from Bright Data's `x-brd-cost` response header when available. */
  costUsd: number;
  durationMs: number;
  ok: boolean;
  errorMessage: string | null;
}

/**
 * Approximate Bright Data credit cost per call. Base scraping/search tools are
 * ~1 credit/request; structured Web Data is ~1 credit per returned record;
 * Scraping Browser bills by traffic/time so this is a per-page estimate. These
 * power the demo "usage" panel — they're estimates, not a billing source.
 */
export const CREDITS: Record<BdProduct, number> = {
  web_unlocker: 1,
  serp: 1,
  scraping_browser: 2,
  web_data: 1, // multiplied by record count by the caller
  direct_fetch: 0, // plain HTTP GET — free
};

export function makeCall(
  product: BdProduct,
  operation: string,
  url: string | null,
  partial: Partial<Omit<BdCall, "product" | "operation" | "url">>
): BdCall {
  return {
    product,
    operation,
    url,
    httpStatus: partial.httpStatus ?? null,
    bytes: partial.bytes ?? null,
    credits: partial.credits ?? 0,
    costUsd: partial.costUsd ?? 0,
    durationMs: partial.durationMs ?? 0,
    ok: partial.ok ?? false,
    errorMessage: partial.errorMessage ?? null,
  };
}

/** Approx. USD per credit on the free/standard plan — fallback when no header. */
export const USD_PER_CREDIT = 0.0015;

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
