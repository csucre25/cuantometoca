// Configuración del site activo (SITE=pe por defecto), resuelta en build.
import { loadSite } from "../site-loader.mjs";

export type Calculadora = { id: string; slug: string; title: string; nombre: string; resumen: string };

export type Site = {
  siteId: string;
  country: string;
  locale: string;
  lang: string;
  currency: string;
  domain: string;
  url: string;
  brand: { name: string; tagline: string; primary_color: string; accent_color: string };
  adsense: { enabled: boolean; client?: string; slots: Record<string, string | undefined> };
  analytics: { cfBeaconToken?: string; ga4Id?: string };
  consent: { mode: "simple_banner" | "google_cmp" };
  calculators: Calculadora[];
  legal: { ownerName: string; contactEmail?: string };
  glossary: {
    entities: { fiscalizador: string; ministerio: string; tributaria: string };
    moneda: { simbolo: string };
  };
};

export const site = loadSite() as Site;
