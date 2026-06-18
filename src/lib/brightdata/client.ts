// Low-level Bright Data API client.
//
// All HTTP-based products (Web Unlocker, SERP API, Web Data datasets) go through
// the account API token + a per-product "zone". Scraping Browser connects over
// CDP and is handled in scraping-browser.ts.

const REQUEST_ENDPOINT = "https://api.brightdata.com/request";

export interface BrightDataConfig {
  token: string;
  unlockerZone: string;
  serpZone: string;
  browserZone: string | null;
  browserPassword: string | null;
  customerId: string | null;
  fbEventsDatasetId: string;
}

export class BrightDataError extends Error {
  httpStatus: number | null;
  constructor(message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "BrightDataError";
    this.httpStatus = httpStatus;
  }
}

/** Returns config, or null if no API token is configured. */
export function getConfig(): BrightDataConfig | null {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) return null;
  return {
    token,
    unlockerZone: process.env.BRIGHTDATA_UNLOCKER_ZONE ?? "sf_events_unlocker",
    serpZone: process.env.BRIGHTDATA_SERP_ZONE ?? "sf_events_serp",
    browserZone: process.env.BRIGHTDATA_BROWSER_ZONE ?? null,
    browserPassword: process.env.BRIGHTDATA_BROWSER_PASSWORD ?? null,
    customerId: process.env.BRIGHTDATA_CUSTOMER_ID ?? null,
    // Bright Data "Facebook — Events by URL" dataset. Override per account.
    fbEventsDatasetId:
      process.env.BRIGHTDATA_FB_EVENTS_DATASET_ID ?? "gd_m14sd0to1jz48ppm51",
  };
}

export function requireConfig(): BrightDataConfig {
  const cfg = getConfig();
  if (!cfg) {
    throw new BrightDataError(
      "Bright Data is not configured — set BRIGHTDATA_API_TOKEN (and zone names) in .env.local"
    );
  }
  return cfg;
}

export interface BdRequestResult {
  body: string;
  httpStatus: number;
  bytes: number;
  /** Actual USD cost from the `x-brd-cost` response header (0 if not reported). */
  costUsd: number;
}

/**
 * POST to the Web Unlocker / SERP `/request` endpoint. `format: "raw"` returns
 * the target page body directly; SERP uses the same endpoint with a search URL.
 * Throws BrightDataError on transport / non-2xx responses.
 */
export async function bdRequest(opts: {
  zone: string;
  url: string;
  format?: "raw" | "json";
  method?: string;
  body?: string;
  timeoutMs?: number;
}): Promise<BdRequestResult> {
  const cfg = requireConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetch(REQUEST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({
        zone: opts.zone,
        url: opts.url,
        format: opts.format ?? "raw",
        ...(opts.method ? { method: opts.method } : {}),
        ...(opts.body ? { body: opts.body } : {}),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    // Bright Data surfaces upstream block failures via x-brd-err-code even on a
    // 200 from the API endpoint — treat those as errors.
    const brdErr = res.headers.get("x-brd-err-code") || res.headers.get("x-brd-error");
    if (!res.ok || brdErr) {
      const msg = res.headers.get("x-brd-err-msg") || text.slice(0, 300) || brdErr || "unknown";
      throw new BrightDataError(`Bright Data request failed (${res.status}${brdErr ? ` ${brdErr}` : ""}): ${msg}`, res.status);
    }
    const costUsd = parseFloat(res.headers.get("x-brd-cost") ?? "") || 0;
    return { body: text, httpStatus: res.status, bytes: Buffer.byteLength(text), costUsd };
  } catch (err) {
    if (err instanceof BrightDataError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new BrightDataError(`Bright Data request timed out for ${opts.url}`);
    }
    throw new BrightDataError(
      `Bright Data request error for ${opts.url}: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Generic GET against the Bright Data datasets API (Bearer auth). */
export async function bdDatasetFetch(
  pathAndQuery: string,
  init?: RequestInit
): Promise<Response> {
  const cfg = requireConfig();
  return fetch(`https://api.brightdata.com${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}
