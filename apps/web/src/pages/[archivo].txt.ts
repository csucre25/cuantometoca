import type { APIRoute } from "astro";
import { site } from "../site.config";

// ads.txt: solo se publica si AdSense está activo y hay ID de cliente (docs/07 §2).
export function getStaticPaths() {
  return site.adsense.enabled && site.adsense.client ? [{ params: { archivo: "ads" } }] : [];
}

export const GET: APIRoute = () => {
  const pub = site.adsense.client!.replace(/^ca-/, "");
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
