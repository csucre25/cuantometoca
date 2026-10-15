declare module "*/site-loader.mjs" {
  export function repoRoot(): string;
  export function loadSite(siteId?: string): unknown;
}
