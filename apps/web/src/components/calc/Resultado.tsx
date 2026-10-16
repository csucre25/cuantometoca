import type { ParametrosPais, ResultadoCalculo } from "@calc/core";
import { useState } from "preact/hooks";
import { esMonto, fecha, porcentaje, soles } from "./formato";

type Props = {
  r: ResultadoCalculo;
  etiquetaTotal: string;
  params: ParametrosPais;
  etiquetasParametros: Record<string, string>;
  titulo: string;
  /** Genera el enlace compartible (con los datos en el fragmento #). */
  enlace: () => string;
};

export function Resultado({ r, etiquetaTotal, params, etiquetasParametros, titulo, enlace }: Props) {
  // Un solo concepto igual al total no aporta: se omite la lista.
  const mostrarConceptos = r.conceptos.length > 1;

  return (
    <div class="calc-resultado-cuerpo">
      <p class="calc-total-etiqueta">{etiquetaTotal}</p>
      <p class="calc-total">{soles(r.total)}</p>

      {r.advertencias.length > 0 && (
        <ul class="calc-avisos" role="list">
          {r.advertencias.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {mostrarConceptos && (
        <dl class="calc-conceptos">
          {r.conceptos.map((c) => (
            <div key={c.id}>
              <dt>{c.etiqueta}</dt>
              <dd>{soles(c.monto)}</dd>
            </div>
          ))}
        </dl>
      )}

      <details class="calc-plegable">
        <summary>¿Cómo se calculó?</summary>
        <ol class="calc-pasos">
          {r.steps.map((p, i) => (
            <li key={i}>
              <div class="calc-paso-fila">
                <span>{p.descripcion}</span>
                <strong>{esMonto(p.valor) ? soles(p.valor) : p.valor}</strong>
              </div>
              <span class="calc-formula">{p.formula}</span>
            </li>
          ))}
        </ol>
        {r.ajusteRedondeo && (
          <p class="calc-nota">
            Cada concepto se muestra redondeado a dos decimales; el total se calcula con los valores exactos, por eso puede
            diferir en un céntimo.
          </p>
        )}
        {r.parametrosUsados.length > 0 && (
          <>
            <h3 class="calc-subtitulo">Valores legales usados</h3>
            <ul class="calc-parametros" role="list">
              {r.parametrosUsados.map((p) => (
                <li key={p.clave}>
                  <span>{nombreParametro(p.clave, params, etiquetasParametros)}</span>
                  <strong>{valorParametro(p.clave, p.valor, params)}</strong>
                  <span class="calc-fuente">
                    Desde {fecha(p.vigenteDesde)} · {p.fuente}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r.baseLegal.length > 0 && <p class="calc-nota">Base legal: {r.baseLegal.join(", ")}.</p>}
      </details>

      <details class="calc-plegable">
        <summary>Condiciones</summary>
        <h3 class="calc-subtitulo">Para recibirlo</h3>
        <ul class="calc-lista">
          {r.condiciones.requisitos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h3 class="calc-subtitulo">En este cálculo consideramos</h3>
        <ul class="calc-lista">
          {r.condiciones.supuestos.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>

      <Compartir titulo={titulo} total={soles(r.total)} enlace={enlace} />
    </div>
  );
}

function Compartir({ titulo, total, enlace }: { titulo: string; total: string; enlace: () => string }) {
  const [copiado, setCopiado] = useState(false);
  async function compartir(e: Event) {
    const url = enlace();
    (e.currentTarget as HTMLElement).dataset.enlace = url; // para pruebas e2e
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: `${titulo}: ${total}`, url });
        return;
      } catch {
        /* cancelado: se intenta copiar */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sin permiso de portapapeles */
    }
  }
  return (
    <button type="button" class="calc-compartir" onClick={compartir}>
      {copiado ? "Enlace copiado" : "Compartir este cálculo"}
    </button>
  );
}

function raiz(clave: string) {
  return clave.split(".")[0]!;
}

function nombreParametro(clave: string, params: ParametrosPais, etiquetas: Record<string, string>) {
  return etiquetas[raiz(clave)] ?? params.params[raiz(clave)]?.description ?? clave;
}

function valorParametro(clave: string, valor: string, params: ParametrosPais) {
  const unidad = params.params[raiz(clave)]?.unit;
  if (!/^-?\d+(\.\d+)?$/.test(valor)) return valor;
  if (unidad === "PEN") return soles(valor);
  if (unidad === "ratio") return porcentaje(valor);
  if (clave.endsWith(".gratificacion") || clave.endsWith(".cts")) return porcentaje(valor);
  return valor;
}
