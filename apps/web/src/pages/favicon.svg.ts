import type { APIRoute } from "astro";
import { site } from "../site.config";

// Favicon con el color de marca del site.
export const GET: APIRoute = () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${site.brand.primary_color}"/><text x="16" y="21" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="13" font-weight="800" fill="#fff" text-anchor="middle">${site.glossary.moneda.simbolo}</text></svg>`,
    { headers: { "Content-Type": "image/svg+xml" } },
  );
