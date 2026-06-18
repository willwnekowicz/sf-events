// Bright Data Scraping Browser — a remote headless Chrome (with built-in
// unblocking + residential proxies) driven over CDP. For JS-heavy / infinite
// -scroll sources (Meetup, Partiful) where a single unlock isn't enough.
//
// playwright-core is imported lazily so a missing dependency degrades to a
// recorded failed call instead of breaking the build.

import { getConfig } from "./client";
import { BdCall, CREDITS, errMsg, makeCall, USD_PER_CREDIT } from "./types";

export interface BrowserResult {
  content: string;
  call: BdCall;
}

function cdpEndpoint(): string | null {
  const cfg = getConfig();
  if (!cfg || !cfg.browserZone || !cfg.customerId || !cfg.browserPassword) {
    return null;
  }
  const user = `brd-customer-${cfg.customerId}-zone-${cfg.browserZone}`;
  return `wss://${user}:${cfg.browserPassword}@brd.superproxy.io:9222`;
}

/**
 * Load a page in the Scraping Browser, optionally scrolling to trigger lazy
 * loading, and return the rendered HTML. Never throws.
 */
export async function fetchRenderedHtml(
  url: string,
  opts: { scroll?: boolean; waitMs?: number } = {}
): Promise<BrowserResult> {
  const startedAt = Date.now();
  const endpoint = cdpEndpoint();

  if (!endpoint) {
    return {
      content: "",
      call: makeCall("scraping_browser", "navigate", url, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage:
          "Scraping Browser not configured (need BRIGHTDATA_CUSTOMER_ID, BRIGHTDATA_BROWSER_ZONE, BRIGHTDATA_BROWSER_PASSWORD)",
      }),
    };
  }

  let browser: { close: () => Promise<void> } | null = null;
  try {
    const pw = (await import("playwright-core")) as typeof import("playwright-core");
    browser = await pw.chromium.connectOverCDP(endpoint);
    // Bright Data's Scraping Browser exposes a default context over CDP — use
    // it directly (newPage) rather than spinning up a fresh context.
    const page = await (browser as import("playwright-core").Browser).newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    if (opts.scroll) {
      // Nudge lazy-loaded lists a few times.
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(800);
      }
    }
    if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
    const html = await page.content();
    return {
      content: html,
      call: makeCall("scraping_browser", "navigate", url, {
        ok: true,
        httpStatus: 200,
        bytes: Buffer.byteLength(html),
        credits: CREDITS.scraping_browser,
        costUsd: CREDITS.scraping_browser * USD_PER_CREDIT,
        durationMs: Date.now() - startedAt,
      }),
    };
  } catch (err) {
    return {
      content: "",
      call: makeCall("scraping_browser", "navigate", url, {
        ok: false,
        durationMs: Date.now() - startedAt,
        errorMessage: errMsg(err),
      }),
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      /* noop */
    }
  }
}
