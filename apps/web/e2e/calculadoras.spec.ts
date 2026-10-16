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
    await page.locator("summary", { hasText: "¿Cómo se calculó?" }).click();
    await expect(pasos).toBeVisible();
    await expect(pasos).toContainText("Remuneración computable");
    await page.locator("summary", { hasText: "Condiciones" }).click();
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

test.describe("resto de calculadoras", () => {
  test("vacaciones truncas por meses (caso V1)", async ({ page }) => {
    await abrir(page, "/vacaciones-truncas/?sueldo=3000&tiempo=meses&meses=7&dias=15");
    await expect(total(page)).toHaveText("S/ 1,875.00");
  });

  test("vacaciones truncas por fechas pide el ingreso", async ({ page }) => {
    await abrir(page, "/vacaciones-truncas/?sueldo=3000");
    await expect(page.locator(".calc-espera")).toContainText("fecha de ingreso");
    await page.fill("#c-ingreso", "2024-03-10");
    await page.fill("#c-cese", "2026-08-24");
    await expect(total(page)).toHaveText("S/ 1,375.00");
  });

  test("liquidación por despido (caso L2) con nota de redondeo", async ({ page }) => {
    await abrir(page, "/liquidacion/?sueldo=2500&asig=1&ingreso=2023-03-01&cese=2026-08-20&motivo=despido_arbitrario&diasMes=20");
    await expect(total(page)).toHaveText("S/ 17,991.47");
    await expect(page.locator(".calc-conceptos")).toContainText("Indemnización por despido arbitrario");
    await page.locator("summary", { hasText: "¿Cómo se calculó?" }).click();
    await expect(page.locator(".calc-nota").first()).toContainText("céntimo");
  });

  test("liquidación: plazo fijo pide la fecha de vencimiento", async ({ page }) => {
    await abrir(page, "/liquidacion/?sueldo=3000&ingreso=2025-01-01&cese=2026-08-15&motivo=despido_arbitrario");
    await expect(page.locator("#c-fin")).toHaveCount(0);
    await page.getByText("A plazo fijo").click();
    await expect(page.locator(".calc-espera")).toContainText("vencía tu contrato");
    await page.fill("#c-fin", "2026-12-31");
    await expect(page.locator(".calc-conceptos")).toContainText("S/ 20,400.00");
  });

  test("utilidades con el comunicado (caso U1)", async ({ page }) => {
    await abrir(page, "/utilidades/?modo=exacto&sector=industrial&renta=1000000&diasTotales=7300&diasTrab=365&remTotales=720000&remTrab=36000&anio=2025");
    await expect(total(page)).toHaveText("S/ 5,000.00");
  });

  test("utilidades estimadas avisan que es una estimación", async ({ page }) => {
    await abrir(page, "/utilidades/?sector=minera&renta=5000000&trabajadores=100&anio=2025");
    await expect(total(page)).toHaveText("S/ 4,000.00");
    await expect(page.locator(".calc-avisos")).toContainText("estimación");
  });

  test("sueldo neto con ONP sin renta de quinta", async ({ page }) => {
    await abrir(page, "/sueldo-neto/?sueldo=3000&sistema=onp&renta=0");
    await expect(total(page)).toHaveText("S/ 2,610.00");
  });

  test("sueldo neto con AFP pide elegir la AFP", async ({ page }) => {
    await abrir(page, "/sueldo-neto/?sueldo=3000");
    await expect(page.locator(".calc-espera")).toContainText("Elige tu AFP");
    await page.selectOption("#c-afp", "integra");
    await expect(page.locator(".calc-conceptos")).toContainText("Prima de seguro");
  });

  test("renta de quinta (caso R1)", async ({ page }) => {
    await abrir(page, "/renta-quinta-categoria/?sueldo=5000&anio=2026");
    await expect(total(page)).toHaveText("S/ 2,886.00");
  });

  test("horas extras: 2 h al 25% + 1 h al 35% (caso H1)", async ({ page }) => {
    await abrir(page, "/horas-extras/?sueldo=2400&horas=3");
    await expect(total(page)).toHaveText("S/ 38.50");
  });
});

test("todas las calculadoras del inicio tienen página", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Próximamente")).toHaveCount(0);
  const enlaces = await page.locator(".tarjeta").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(enlaces).toHaveLength(8);
  for (const href of enlaces) {
    const r = await page.request.get(href!);
    expect(r.status(), href!).toBe(200);
  }
});

test("sin scroll horizontal en ninguna página", async ({ page }) => {
  const rutas = ["/", "/gratificacion/?sueldo=2500", "/cts/?sueldo=2500", "/liquidacion/?sueldo=2500&ingreso=2024-01-01", "/utilidades/?modo=exacto", "/sueldo-neto/?sueldo=2500&afp=prima", "/parametros-vigentes/", "/privacidad/"];
  for (const ruta of rutas) {
    await page.goto(ruta);
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(desborde, ruta).toBeLessThanOrEqual(0);
  }
});
