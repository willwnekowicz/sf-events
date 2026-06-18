// Bright Data client — public surface.
//
// Products wired in:
//   - Web Unlocker   (web-unlocker.ts) — unlock bot-protected HTML
//   - SERP API       (serp.ts)         — structured search results
//   - Scraping Browser (scraping-browser.ts) — JS-rendered pages over CDP
//   - Web Data       (web-data.ts)     — structured dataset records (FB events)
//
// Every call returns a `BdCall` telemetry record (success or failure) which the
// pipeline persists to `scrape_bd_calls` for the dashboard's usage panel.

export { getConfig, requireConfig, BrightDataError } from "./client";
export type { BrightDataConfig } from "./client";
export { unlock } from "./web-unlocker";
export type { UnlockResult } from "./web-unlocker";
export { search } from "./serp";
export type { SerpOrganic, SerpResult } from "./serp";
export { fetchRenderedHtml } from "./scraping-browser";
export type { BrowserResult } from "./scraping-browser";
export { facebookEvents } from "./web-data";
export type { WebDataResult } from "./web-data";
export { getAccountInfo } from "./account";
export type { AccountInfo } from "./account";
export { CREDITS } from "./types";
export type { BdCall, BdProduct } from "./types";

export const BD_PRODUCT_LABELS: Record<string, string> = {
  web_unlocker: "Web Unlocker",
  serp: "SERP API",
  scraping_browser: "Scraping Browser",
  web_data: "Web Data",
  web_data_facebook_events: "Web Data",
  direct_fetch: "Direct fetch",
};
