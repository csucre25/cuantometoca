import sharp from "sharp";

// Imágenes Open Graph 1200×630 generadas en build (SVG → PNG). Las redes sociales no aceptan SVG.

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Datos = {
  marca: string;
  simbolo: string;
  color: string;
  titulo: string;
  leyenda?: string;
  etiqueta?: string;
  monto?: string;
  pie: string;
};

export function svgOg(d: Datos): string {
  const fuente = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
  const ejemplo = d.monto
    ? `<text x="80" y="388" font-size="34" fill="#57625f">${escapar(d.leyenda ?? "")}</text>
       <text x="80" y="446" font-size="30" font-weight="600" fill="#57625f">${escapar(d.etiqueta ?? "")}</text>
       <text x="80" y="530" font-size="84" font-weight="800" fill="${d.color}" letter-spacing="-2">${escapar(d.monto)}</text>`
    : `<text x="80" y="400" font-size="38" fill="#57625f">${escapar(d.leyenda ?? "")}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" font-family="${fuente}">
  <rect width="1200" height="630" fill="#f7f8f7"/>
  <rect x="0" y="0" width="1200" height="12" fill="${d.color}"/>
  <rect x="80" y="70" width="64" height="64" rx="16" fill="${d.color}"/>
  <text x="112" y="113" font-size="26" font-weight="800" fill="#fff" text-anchor="middle">${escapar(d.simbolo)}</text>
  <text x="164" y="113" font-size="32" font-weight="700" fill="#17201f">${escapar(d.marca)}</text>
  <text x="80" y="290" font-size="76" font-weight="800" fill="#17201f" letter-spacing="-2">${escapar(d.titulo)}</text>
  ${ejemplo}
  <text x="1120" y="590" font-size="24" fill="#8a9592" text-anchor="end">${escapar(d.pie)}</text>
</svg>`;
}

export async function pngOg(d: Datos): Promise<Uint8Array> {
  return new Uint8Array(await sharp(Buffer.from(svgOg(d))).png({ compressionLevel: 9 }).toBuffer());
}
