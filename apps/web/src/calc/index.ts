import type { ParametrosPais } from "@calc/core";
import type { Definicion } from "./tipos";
import { cts } from "./pe/cts";
import { ETIQUETAS_PARAMETROS, paramsPe } from "./pe/contexto";
import { gratificacion } from "./pe/gratificacion";

// Formularios y parámetros por país (config/countries/<pais>/). Agregar un país = agregar su
// carpeta y su entrada aquí; los componentes no cambian.
type Pais = {
  definiciones: Record<string, Definicion>;
  params: ParametrosPais;
  etiquetasParametros: Record<string, string>;
};

export const paises: Record<string, Pais> = {
  pe: { definiciones: { gratificacion, cts }, params: paramsPe, etiquetasParametros: ETIQUETAS_PARAMETROS },
};

export function definicion(country: string, id: string): Definicion | undefined {
  return paises[country]?.definiciones[id];
}
