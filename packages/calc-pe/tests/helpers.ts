import { crearLectorParametros, type ParametrosPais } from "@calc/core";
import paramsPe from "../../../config/countries/pe/params.json";
import type { Contexto } from "../src";

export const ctx: Contexto = { params: crearLectorParametros(paramsPe as ParametrosPais) };
