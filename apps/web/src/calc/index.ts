import type { ParametrosPais } from "@calc/core";
import type { Definicion, PaginaParametros } from "./tipos";
import { ETIQUETAS_PARAMETROS, paramsPe } from "./pe/contexto";
import { cts } from "./pe/cts";
import { gratificacion } from "./pe/gratificacion";
import { horasExtras } from "./pe/horasExtras";
import { liquidacion } from "./pe/liquidacion";
import { paginaParametros } from "./pe/parametrosVigentes";
import { renta5ta } from "./pe/renta5ta";
import { sueldoNeto } from "./pe/sueldoNeto";
import { utilidades } from "./pe/utilidades";
import { vacaciones } from "./pe/vacaciones";

// Formularios y parámetros por país (config/countries/<pais>/). Agregar un país = agregar su
// carpeta y su entrada aquí; los componentes no cambian.
type Pais = {
  definiciones: Record<string, Definicion>;
  params: ParametrosPais;
  etiquetasParametros: Record<string, string>;
  paginaParametros: (hoy: string) => PaginaParametros;
};

export const paises: Record<string, Pais> = {
  pe: {
    // Claves = IDs de config/countries/pe/calculators.yaml
    definiciones: {
      gratificacion,
      cts,
      vacaciones_truncas: vacaciones,
      liquidacion,
      utilidades,
      sueldo_neto: sueldoNeto,
      renta_quinta: renta5ta,
      horas_extras: horasExtras,
    },
    params: paramsPe,
    etiquetasParametros: ETIQUETAS_PARAMETROS,
    paginaParametros,
  },
};

export function definicion(country: string, id: string): Definicion | undefined {
  return paises[country]?.definiciones[id];
}
