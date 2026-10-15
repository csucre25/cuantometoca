import { expect, test, type Page } from "@playwright/test";

// La isla está lista cuando Astro le quita el atributo `ssr` tras hidratar.
async function abrir(page: Page, ruta: string) {
  await page.goto(ruta);
  await page.waitForSelector("astro-island:not([ssr])");
}

const total = (page: Page) => page.locator(".calc-total");

test.describe("gratificación", () => {
  test("un enlace compartido reproduce el cálculo (caso G3)", async ({ page }) => {
    await abrir(page, "/gratificacion/?sueldo=2000&asig=1&meses=4&periodo=diciembre&anio=2026");
    await expect(total(page)).toHaveText("S/ 1,542.71");
    await expect(page.locator(".calc-conceptos")).toContainText("Bonificación extraordinaria (9%)");
  });

  test("escribir el sueldo calcula en vivo y actualiza la URL", async ({ page }) => {
    await abrir(page, "/gratificacion/");
    await expect(page.locator(".calc-espera")).toContainText("Ingresa tu sueldo");
    await page.fill("#c-sueldo", "2,000");
    await expect(total(page)).toHaveText("S/ 2,180.00");
    await expect(page).toHaveURL(/sueldo=2000/);

    // Recargar el enlace da el mismo resultado.
    await page.reload();
    await page.waitForSelector("astro-island:not([ssr])");
    await expect(total(page)).toHaveText("S/ 2,180.00");
  });

  test("el desglose y las condiciones están plegados y se abren", async ({ page }) => {
    await abrir(page, "/gratificacion/?sueldo=1500&anio=2026&periodo=julio");
    const pasos = page.locator(".calc-pasos");
    await expect(pasos).toBeHidden();
    await page.getByText("¿Cómo se calculó?").click();
    await expect(pasos).toBeVisible();
    await expect(pasos).toContainText("Remuneración computable");
    await page.getByText("Condiciones", { exact: true }).click();
    await expect(page.locator(".calc-lista").first()).toContainText("15 de julio");
  });

  test("por fechas: calcula los meses calendario completos", async ({ page }) => {
    await abrir(page, "/gratificacion/?sueldo=2000&periodo=julio&anio=2026");
    await page.getByText("Por fechas").click();
    await page.fill("#c-ingreso", "2026-03-15");
    await expect(total(page)).toHaveText("S/ 1,090.00");
  });

  test("un monto inválido muestra el error junto al campo", async ({ page }) => {
    await abrir(page, "/gratificacion/?sueldo=2000");
    await page.fill("#c-sueldo", "20.0.0");
    await expect(page.locator(".calc-error")).toBeVisible();
  });
});

test.describe("CTS", () => {
  test("caso C1 desde el formulario", async ({ page }) => {
    await abrir(page, "/cts/?periodo=mayo&anio=2026");
    await page.fill("#c-sueldo", "3000");
    await page.getByText("Más opciones").click();
    await page.fill("#c-grati", "3000");
    await expect(total(page)).toHaveText("S/ 1,750.00");
  });

  test("meses y días (caso C2)", async ({ page }) => {
    await abrir(page, "/cts/?sueldo=3000&grati=3000&meses=4&dias=10&periodo=mayo&anio=2026");
    await expect(total(page)).toHaveText("S/ 1,263.89");
  });
});

test("sin scroll horizontal en ninguna página", async ({ page }) => {
  for (const ruta of ["/", "/gratificacion/?sueldo=2500", "/cts/?sueldo=2500", "/privacidad/"]) {
    await page.goto(ruta);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde, ruta).toBeLessThanOrEqual(0);
  }
});
