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

test.describe("parámetros vigentes", () => {
  test("muestra los valores con vigencia y fuente, sin notas internas", async ({ page }) => {
    await page.goto("/parametros-vigentes/");
    for (const t of ["Remuneraciones", "Gratificación y CTS", "Impuesto a la renta de quinta categoría", "Pensiones", "Utilidades"]) {
      await expect(page.getByRole("heading", { name: t, level: 2 })).toBeVisible();
    }
    const fila = page.locator(".fila", { hasText: "Remuneración mínima vital" });
    await expect(fila.locator("strong")).toHaveText(/^S\/\s[\d,]+\.\d{2}$/);
    await expect(fila.locator(".fuente")).toContainText(/Desde \d{2}\/\d{2}\/\d{4} · DS/);
    // Las notas internas de params.json (campo "nota") nunca se publican.
    await expect(page.locator("body")).not.toContainText("afpintegra");
    await expect(page.locator("body")).not.toContainText("segundo tramo");
  });

  test("está en el sitemap y en el pie", async ({ page, request }) => {
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/parametros-vigentes/");
    await page.goto("/");
    await expect(page.locator("footer").getByRole("link", { name: "Parámetros vigentes" })).toHaveAttribute("href", "/parametros-vigentes/");
  });
});

test("cada calculadora publica su guía aprobada, sin aviso de borrador (CLAUDE.md, regla 6)", async ({ page }) => {
  for (const ruta of ["/gratificacion/", "/cts/", "/vacaciones-truncas/", "/liquidacion/", "/utilidades/", "/sueldo-neto/", "/renta-quinta-categoria/", "/horas-extras/"]) {
    await page.goto(ruta);
    await expect(page.locator(".guia"), ruta).toBeVisible();
    await expect(page.getByText("Borrador pendiente de aprobación")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  }
});
