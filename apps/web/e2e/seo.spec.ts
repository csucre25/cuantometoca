import { expect, test } from "@playwright/test";

// SEO técnico (tarea 2.5): sitemap, robots, canonical, datos estructurados e imágenes OG.
test.describe("SEO técnico", () => {
  test("robots.txt apunta al sitemap", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toContain("Allow: /");
    expect(txt).toMatch(/Sitemap: https:\/\/[^/]+\/sitemap\.xml/);
  });

  test("el sitemap lista el inicio y las 8 calculadoras con URL absoluta", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    for (const ruta of ["/", "/gratificacion/", "/cts/", "/liquidacion/", "/utilidades/", "/sueldo-neto/", "/horas-extras/"]) {
      expect(urls.some((u) => u.endsWith(ruta))).toBe(true);
    }
    expect(urls.every((u) => u.startsWith("https://"))).toBe(true);
    expect(urls.some((u) => u.includes("404"))).toBe(false);
  });

  test("cada calculadora tiene canonical, imagen OG y datos estructurados válidos", async ({ page, request }) => {
    await page.goto("/gratificacion/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/gratificacion\/$/);
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(og).toMatch(/\/og\/gratificacion\.png$/);
    const img = await request.get(new URL(og!).pathname);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toContain("image/png");

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const tipos = ld.map((t) => JSON.parse(t)["@type"]);
    expect(tipos).toEqual(["WebApplication", "BreadcrumbList"]);
  });

  test("el 404 no se indexa", async ({ page }) => {
    await page.goto("/no-existe/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });
});
