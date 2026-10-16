import type { Campo as TCampo } from "../../calc/tipos";
import { normalizarMonto, simboloMoneda } from "./formato";

type Props = { campo: TCampo; valor: string; error?: string; onCambio: (valor: string) => void };

export function Campo({ campo, valor, error, onCambio }: Props) {
  const id = `c-${campo.id}`;
  const ayudaId = campo.ayuda ? `${id}-ayuda` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [ayudaId, errorId].filter(Boolean).join(" ") || undefined;

  if (campo.tipo === "si-no") {
    return (
      <div class="calc-campo calc-campo--switch">
        <label class="calc-switch" for={id}>
          <span>
            <span class="calc-etiqueta">{campo.etiqueta}</span>
            {campo.ayuda && <span class="calc-ayuda" id={ayudaId}>{campo.ayuda}</span>}
          </span>
          <input id={id} type="checkbox" role="switch" checked={valor === "1"} aria-describedby={describedBy} onChange={(e) => onCambio(e.currentTarget.checked ? "1" : "0")} />
        </label>
      </div>
    );
  }

  if (campo.tipo === "opciones" && campo.estilo === "segmentado") {
    return (
      <fieldset class="calc-campo">
        <legend class="calc-etiqueta">{campo.etiqueta}</legend>
        <div class="calc-segmentado">
          {campo.opciones.map((o) => (
            <label key={o.valor} class={valor === o.valor ? "activo" : ""}>
              <input type="radio" name={id} value={o.valor} checked={valor === o.valor} onChange={() => onCambio(o.valor)} />
              {o.etiqueta}
            </label>
          ))}
        </div>
        {campo.ayuda && <p class="calc-ayuda">{campo.ayuda}</p>}
      </fieldset>
    );
  }

  let control;
  if (campo.tipo === "opciones") {
    control = (
      <select id={id} value={valor} aria-describedby={describedBy} onChange={(e) => onCambio(e.currentTarget.value)}>
        {campo.opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    );
  } else if (campo.tipo === "dinero") {
    control = (
      <div class="calc-dinero">
        <span aria-hidden="true">{simboloMoneda}</span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={campo.placeholder}
          value={valor}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onInput={(e) => onCambio(normalizarMonto(e.currentTarget.value))}
        />
      </div>
    );
  } else if (campo.tipo === "entero") {
    control = (
      <div class={campo.max > 9999 ? "calc-entero calc-entero--ancho" : "calc-entero"}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={campo.min}
          max={campo.max}
          step={campo.paso ?? 1}
          value={valor}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          onInput={(e) => onCambio(e.currentTarget.value)}
        />
        {campo.sufijo && <span>{campo.sufijo}</span>}
      </div>
    );
  } else {
    control = (
      <input
        id={id}
        type="date"
        value={valor}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        onInput={(e) => onCambio(e.currentTarget.value)}
      />
    );
  }

  return (
    <div class="calc-campo">
      <label class="calc-etiqueta" for={id}>
        {campo.etiqueta}
      </label>
      {control}
      {campo.ayuda && (
        <p class="calc-ayuda" id={ayudaId}>
          {campo.ayuda}
        </p>
      )}
      {error && (
        <p class="calc-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
