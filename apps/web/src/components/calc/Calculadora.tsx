import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { paises } from "../../calc";
import type { Campo as TCampo, Valores } from "../../calc/tipos";
import { Campo } from "./Campo";
import { configurarMoneda, hoyLocal, normalizarMonto } from "./formato";
import { Resultado } from "./Resultado";

type Props = {
  country: string;
  calcId: string;
  titulo: string;
  /** Fecha del build: el HTML inicial se genera con ella y el navegador la reemplaza por la de hoy. */
  hoyBuild: string;
  moneda: { locale: string; codigo: string; simbolo: string };
};

// Campos del motor → campos del formulario, para ubicar los errores de validación.
const CAMPO_DE_ERROR: Record<string, string> = {
  sueldoBasico: "sueldo",
  mesesCompletos: "meses",
  diasAdicionales: "dias",
  fechaIngreso: "ingreso",
  fechaCese: "cese",
  otrosRegulares: "otros",
  gratiSemestre: "grati",
};

type Issue = { path: (string | number)[]; message: string };

export default function Calculadora({ country, calcId, titulo, hoyBuild, moneda }: Props) {
  configurarMoneda(moneda.locale, moneda.codigo, moneda.simbolo);
  const pais = paises[country]!;
  const def = pais.definiciones[calcId]!;

  const [hoy, setHoy] = useState(hoyBuild);
  const [valores, setValores] = useState<Valores>(() => def.iniciales(hoyBuild));
  const [tocados, setTocados] = useState<Set<string>>(new Set());
  const montado = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Al montar: fecha real de hoy y valores del enlace compartido (?sueldo=1500&meses=6…).
  useEffect(() => {
    const hoyReal = hoyLocal();
    const desdeUrl = Object.fromEntries(new URLSearchParams(window.location.search));
    const iniciales = def.iniciales(hoyReal);
    const conocidos = new Set([...def.campos, ...def.avanzados].map((c) => c.id));
    const validos = Object.fromEntries(Object.entries(desdeUrl).filter(([k]) => conocidos.has(k)));
    // Lo que la persona alcanzó a escribir antes de que cargara la isla no se pierde.
    const escritos = leerEscritos(formRef.current, [...def.campos, ...def.avanzados]);
    setHoy(hoyReal);
    setValores({ ...iniciales, ...validos, ...escritos });
    setTocados(new Set([...Object.keys(validos), ...Object.keys(escritos)]));
    montado.current = true;
  }, []);

  // El estado vive en la URL para que cualquier enlace reproduzca el cálculo.
  useEffect(() => {
    if (!montado.current) return;
    const iniciales = def.iniciales(hoy);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(valores)) if (v !== "" && v !== iniciales[k]) q.set(k, v);
    const qs = q.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [valores, hoy]);

  const salida = useMemo(() => {
    if (!valores.sueldo) return { vacio: true as const };
    try {
      return { r: def.calcular(valores, hoy) };
    } catch (e) {
      const issues = (e as { issues?: Issue[] }).issues;
      const errores: Record<string, string> = {};
      for (const i of issues ?? []) {
        const campo = CAMPO_DE_ERROR[String(i.path[0])] ?? String(i.path[0]);
        errores[campo] ??= i.message;
      }
      return { errores, mensaje: issues ? undefined : "No pudimos calcular con estos datos." };
    }
  }, [valores, hoy]);

  const cambiar = (id: string) => (v: string) => {
    setValores((prev) => ({ ...prev, [id]: v }));
    setTocados((prev) => new Set(prev).add(id));
  };

  const errores: Record<string, string> = ("errores" in salida && salida.errores) || {};
  const visibles = (lista: TCampo[]) => lista.filter((c) => def.visible?.(c.id, valores) ?? true);
  const render = (c: TCampo) => (
    <Campo key={c.id} campo={c} valor={valores[c.id] ?? ""} error={tocados.has(c.id) ? errores[c.id] : undefined} onCambio={cambiar(c.id)} />
  );

  return (
    <div class="calc">
      <form ref={formRef} class="calc-formulario" onSubmit={(e) => e.preventDefault()} noValidate>
        {visibles(def.campos).map(render)}
        {def.avanzados.length > 0 && (
          <details class="calc-mas">
            <summary>Más opciones</summary>
            <div class="calc-mas-campos">{visibles(def.avanzados).map(render)}</div>
          </details>
        )}
      </form>

      <section class="calc-resultado" aria-live="polite" aria-label="Resultado">
        {"r" in salida && salida.r ? (
          <Resultado r={salida.r} etiquetaTotal={def.etiquetaTotal} params={pais.params} etiquetasParametros={pais.etiquetasParametros} titulo={titulo} />
        ) : (
          <div class="calc-espera">
            <p class="calc-total-etiqueta">{def.etiquetaTotal}</p>
            <p class="calc-total calc-total--vacio">—</p>
            <p class="muted">
              {"vacio" in salida
                ? "Ingresa tu sueldo para ver el resultado."
                : ("mensaje" in salida && salida.mensaje) || "Revisa los datos marcados para ver el resultado."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Valores de texto ya escritos en el HTML inicial (antes de hidratar). */
function leerEscritos(form: HTMLFormElement | null, campos: TCampo[]): Valores {
  const escritos: Valores = {};
  if (!form) return escritos;
  for (const c of campos) {
    if (c.tipo !== "dinero" && c.tipo !== "entero" && c.tipo !== "fecha") continue;
    const el = form.querySelector<HTMLInputElement>(`#c-${c.id}`);
    if (el && el.value !== el.defaultValue) escritos[c.id] = c.tipo === "dinero" ? normalizarMonto(el.value) : el.value;
  }
  return escritos;
}
