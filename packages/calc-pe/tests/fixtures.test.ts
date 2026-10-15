import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/casos-dorados.json";

// Integridad del archivo de casos dorados. El test que ejecuta cada caso contra
// su fórmula se agrega en la Fase 1, junto con cada calculadora.
describe("casos dorados (estructura)", () => {
  const casos = fixtures.casos;

  it("tiene ids únicos", () => {
    const ids = casos.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(casos.map((c) => [c.id, c] as const))("%s tiene los campos obligatorios", (_id, caso) => {
    expect(caso.calculadora).toBeTruthy();
    expect(caso.fechaReferencia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(caso.input).toBeTypeOf("object");
    expect(caso.esperado.total).toMatch(/^\d+\.\d{2}$/);
  });
});
