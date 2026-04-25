import { test, expect } from "@playwright/test";

/**
 * Integration probe: the X-Mw-Ran header is set by the proxy on every HTML
 * response. If these tests ever regress, the proxy is not running — likely
 * a rename or matcher regression. See BMAD Epic F3.S2.
 */

const PAGES = ["/en", "/en/listings", "/en/transport", "/en/login"];

for (const path of PAGES) {
  test(`proxy runs on ${path}`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response!.headers()["x-mw-ran"]).toBe("1");
  });
}

test("proxy blocks cross-origin POST", async ({ request }) => {
  const response = await request.post("/api/upload", {
    headers: { origin: "https://evil.example.com" },
    failOnStatusCode: false,
  });
  expect(response.status()).toBe(403);
});
