/**
 * Unit tests for the Bright Data client — verifies cost-header parsing, upstream
 * block detection, and SERP result parsing using a mocked fetch.
 */
import { unlock } from "../web-unlocker";
import { search } from "../serp";

type Headers = Record<string, string>;
function mockResponse(body: string, opts: { ok?: boolean; status?: number; headers?: Headers } = {}) {
  const headers = opts.headers ?? {};
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const realFetch = global.fetch;

beforeAll(() => {
  process.env.BRIGHTDATA_API_TOKEN = "test-token";
  process.env.BRIGHTDATA_UNLOCKER_ZONE = "z_unlock";
  process.env.BRIGHTDATA_SERP_ZONE = "z_unlock";
});
afterAll(() => {
  global.fetch = realFetch;
});

describe("web unlocker", () => {
  it("returns content and reads real USD cost from x-brd-cost", async () => {
    global.fetch = jest.fn(async () =>
      mockResponse("<html>ok</html>", { headers: { "x-brd-cost": "0.0021" } })
    ) as unknown as typeof fetch;

    const r = await unlock("https://example.com");
    expect(r.content).toContain("ok");
    expect(r.call.ok).toBe(true);
    expect(r.call.costUsd).toBeCloseTo(0.0021);
    expect(r.call.product).toBe("web_unlocker");
  });

  it("treats an x-brd-err-code response as a failed (non-throwing) call", async () => {
    global.fetch = jest.fn(async () =>
      mockResponse("", { headers: { "x-brd-err-code": "client_10000", "x-brd-err-msg": "Invalid authentication" } })
    ) as unknown as typeof fetch;

    const r = await unlock("https://example.com");
    expect(r.call.ok).toBe(false);
    expect(r.call.errorMessage).toMatch(/Invalid authentication/);
    expect(r.content).toBe("");
  });
});

describe("serp", () => {
  it("parses organic results from a brd_json payload", async () => {
    const payload = JSON.stringify({
      organic: [
        { title: "AI Meetup SF", link: "https://lu.ma/ai-sf", description: "Tonight" },
        { title: "No link entry" },
      ],
    });
    global.fetch = jest.fn(async () => mockResponse(payload, { headers: { "x-brd-cost": "0.001" } })) as unknown as typeof fetch;

    const r = await search("AI meetup SF", { num: 5 });
    expect(r.call.ok).toBe(true);
    expect(r.results).toHaveLength(1); // entry without a link is dropped
    expect(r.results[0]).toMatchObject({ title: "AI Meetup SF", url: "https://lu.ma/ai-sf" });
  });
});
