// Lighthouse CI sobre el build estático, perfil móvil (por defecto de Lighthouse).
// Se corre con ADS_PREVIEW=1 para medir el diseño con los espacios de anuncio reservados.
module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: [
        "http://localhost/",
        "http://localhost/gratificacion/",
        "http://localhost/liquidacion/",
        // Enlace compartido: el resultado aparece al hidratar (mide el salto que eso provoca).
        "http://localhost/liquidacion/?sueldo=2500&ingreso=2023-03-01&cese=2026-08-20&motivo=despido_arbitrario",
      ],
      numberOfRuns: 1,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertMatrix: [
        {
          // Páginas tal como se publican. CA 2.4: CLS = 0 con los espacios de anuncio vacíos.
          matchingUrlPattern: "^[^?]*$",
          assertions: {
            "cumulative-layout-shift": ["error", { maxNumericValue: 0 }],
            "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
            "categories:performance": ["error", { minScore: 0.9 }],
            "categories:accessibility": ["error", { minScore: 0.9 }],
            "categories:seo": ["error", { minScore: 0.95 }],
          },
        },
        {
          // Enlaces compartidos: el resultado aparece al hidratar. Umbral "bueno" de Google (0.1).
          matchingUrlPattern: "[?]",
          assertions: { "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }] },
        },
      ],
    },
    upload: { target: "filesystem", outputDir: "./.lighthouseci" },
  },
};
