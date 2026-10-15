import { describe, expect, it } from "vitest";
import type { ResultadoCalculo } from "@calc/core";
import { calcularCts, calcularGratificacion, calcularVacacionesTruncas, type Contexto } from "../src";
import fixtures from "./fixtures/casos-dorados.json";
import { ctx } from "./helpers";

// Recorre todos los casos dorados. Las calculadoras aún no implementadas quedan como "todo".
const calculadoras: Record<string, (input: never, c: Contexto) => ResultadoCalculo> = {
  gratificacion: calcularGratificacion,
  cts: calcularCts,
  vacaciones_truncas: calcularVacacionesTruncas,
};

type Esperado = { total: string; conceptos?: Record<string, string>; advertenciaContiene?: string };

describe("casos dorados", () => {
  for (const caso of fixtures.casos) {
    const calcular = calculadoras[caso.calculadora];
    if (!calcular) {
      it.todo(`${caso.id} (${caso.calculadora})`);
      continue;
    }
    it(`${caso.id} (${caso.calculadora})`, () => {
      const esperado = caso.esperado as Esperado;
      const r = calcular(caso.input as never, { ...ctx, fechaReferencia: caso.fechaReferencia });
      expect(r.total).toBe(esperado.total);
      for (const [id, valor] of Object.entries(esperado.conceptos ?? {})) {
        expect(r.conceptos.find((c) => c.id === id)?.monto, `concepto ${id}`).toBe(valor);
      }
      if (esperado.advertenciaContiene) {
        expect(r.advertencias.join(" ")).toContain(esperado.advertenciaContiene);
      }
    });
  }
});
