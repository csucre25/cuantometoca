# 03 — Flujo de trabajo

## 1. Flujo diario automático (sin intervención)
1. **07:15 (Lima)** — GitHub Actions corre `watchers.yml`:
   - `params-check --country pe` revisa El Peruano y la SBS.
   - Si no hay novedades: nada (opcional: un "✅ sin cambios" semanal).
2. Si hay una norma candidata → el bot del site envía:
   ```
   📜 Posible cambio normativo
   "Decreto Supremo que incrementa la Remuneración Mínima Vital…"
   Valor detectado: RMV = 1300.00 desde 2027-0X-01 (extraído por LLM)
   Fuente: <enlace>
   [✅ Confirmar]  [✏️ Corregir valor/fecha]  [❌ Ignorar]
   ```
3. Al confirmar → el pipeline agrega la entrada en `params.json`, hace commit en una rama `params/<fecha>` y abre un PR (o hace push directo a `main` si `AUTO_MERGE_PARAMS=true` y el CI pasa).
4. CI corre los casos dorados; si pasan → deploy automático. El bot avisa: "🚀 Publicado con RMV S/ 1,300".

## 2. Flujo de contenido (borradores con LLM)
1. Disparadores: nueva norma confirmada, inicio de temporada (ver calendario en `docs/05`) o comando `/borrador <tema>` en el bot.
2. El pipeline genera un borrador Markdown (guía, FAQ o noticia corta) **sin números calculados** por el LLM. Los números se insertan como *shortcodes* que el build resuelve con el motor: `{{calc:gratificacion sueldo=1500 meses=6 periodo=julio anio=2027 campo=total}}`.
3. El bot envía una vista previa (título, primeras líneas, enlace a la vista previa local o al diff):
   `[✅ Publicar] [✏️ Pedir cambios] [❌ Descartar]`
4. "Pedir cambios" → el usuario responde con instrucciones en texto → el LLM reescribe → nueva vista previa.
5. Publicar → commit a `apps/web/content/pe/` → deploy agrupado (máximo cada 60 minutos).

## 3. Comandos del bot (por site)
| Comando | Acción |
|---|---|
| `/estado` | Último deploy, parámetros vigentes clave, pendientes de aprobación |
| `/pendientes` | Lista borradores y propuestas de parámetros en cola |
| `/parametros` | RMV, UIT, tasas vigentes con fuente |
| `/borrador <tema>` | Genera un borrador editorial |
| `/temporada` | Checklist de la próxima temporada (grati, CTS, utilidades) |
| `/deploy` | Fuerza un deploy del site |
| `/pausa` / `/reanudar` | Detiene o reanuda el worker local (modo juego) |

El bot solo responde al `admin_chat_id` configurado.

## 4. Flujo de desarrollo con Claude Code
1. Tomar la siguiente tarea no marcada de `docs/04-roadmap.md`.
2. Leer la sección correspondiente de `docs/01` y `docs/02`.
3. Para fórmulas: primero los fixtures (casos dorados), después la implementación (TDD).
4. `pnpm test` y `uv run pytest` en verde; `SITE=pe pnpm build` sin errores.
5. Commit pequeño; marcar la tarea en el roadmap.
6. Si la tarea requiere decisión del usuario (regla legal ambigua, nueva dependencia, cambio de stack): detenerse y preguntar.

## 5. Checklist de temporada (se repite cada año)
| Temporada | Preparar desde | Acciones |
|---|---|---|
| Utilidades | 15 feb | Actualizar casos de utilidades del año, guía "cuándo pagan utilidades" |
| CTS mayo | 15 abr | Casos CTS mayo del año, guía de retiro según norma vigente |
| Grati julio | 15 jun | Casos grati julio, serie de videos (ver `docs/08`) |
| CTS noviembre | 15 oct | Casos CTS noviembre |
| Grati diciembre | 15 nov | Casos grati diciembre, nota sobre RMV si cambió |
| UIT nuevo año | 15 dic | Esperar DS de la UIT y actualizar params con vigencia 01/01 |

## 6. Agregar un país (cuando toque)
1. `/nuevo-pais cl` (Claude Code crea el esqueleto).
2. Completar `config/countries/cl/params.json` con fuentes oficiales.
3. Implementar `packages/calc-cl` con casos dorados verificados.
4. Crear `config/sites/cl.yaml` con su dominio, cuenta de Cloudflare, AdSense y bot.
5. Agregar los secretos `*_CL` en GitHub y activar `enabled: true`.
