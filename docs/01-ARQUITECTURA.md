# Arquitectura — App de Sorteos en Vivo ADIPA

## Stack elegido

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Server Actions + Route Handlers permiten que el secreto Zoom nunca cruce al navegador (§53). Un solo despliegue. |
| UI | **Tailwind CSS v4 + Poppins + Phosphor Icons** | Tokens de `DESIGN.md` como variables CSS. Phosphor es obligatorio por el design system. |
| BD | **PostgreSQL** (Supabase-compatible) vía **Prisma** | Relacional, transacciones para la integridad del sorteo (§55). Prisma da migraciones versionadas y tipos. |
| Auth | **Auth.js v5** (Google OAuth + credenciales) | El rol se resuelve **solo en servidor** desde el email verificado (§6/§40). Session JWT firmada; el rol nunca se lee del cliente. |
| Aleatoriedad | **`crypto.randomInt`** (CSPRNG de Node) + Fisher–Yates | §25. Nunca `Math.random()`. |
| Excel | **ExcelJS** | Lectura (BDD manual) y escritura (.xlsx de resultados). |
| JPG | **@napi-rs/canvas** en servidor | Render server-side determinista, idéntico en cualquier navegador. El comprobante es un artefacto auditable, no una captura del DOM. |
| i18n | **next-intl** | Mensajes en `messages/es.json` / `en.json`. Cero texto hardcodeado (§47). |

### Por qué no `html2canvas` para el JPG
El comprobante queda registrado en auditoría (§37). Generarlo en el navegador lo hace dependiente
de fuentes locales, DPI y versión de navegador → dos operadores producirían imágenes distintas para
el mismo ganador. Se genera en servidor a 1600×900, se guarda y se sirve.

## Flujo de datos (§53)

```
Navegador  ──▶  Route Handler / Server Action  ──▶  ZoomClient (tokens cifrados en BD)  ──▶  api.zoom.us
   ▲                        │
   └── DTOs sin secretos ───┘
```
- Los tokens Zoom se cifran en reposo con **AES-256-GCM** (`ZOOM_TOKEN_ENCRYPTION_KEY`).
- Ningún endpoint devuelve `access_token`, `refresh_token`, `client_secret` ni `account_id`.
- Todo endpoint pasa por `requireRole('ADMIN' | 'OPERATOR')` en servidor.

## Modelo de datos

`User` · `ZoomAccount` · `Meeting` · `Snapshot` · `SnapshotParticipant` · `Draw` · `DrawWinner`
· `ManualOverride` · `AuditLog` · `Certificate`

Claves de integridad:
- `Snapshot` es **inmutable** una vez creado (§11, §55). "Actualizar participantes" crea uno nuevo;
  el anterior se conserva. Ninguna mutación borra snapshots.
- `Draw` guarda `snapshotId`, `eligiblePoolHash` (SHA-256 del pool ordenado), `seedEntropy`,
  configuración y timestamp → el resultado es **reconstruible/auditable** (§55).
- `DrawWinner` es una fila por ganador (§32), con `status`: `PENDING` | `VALIDATED` | `AL_AGUA`.
- Los ganadores previos de la **misma reunión** se excluyen por consulta, no por copia de listas (§24).

## Motor de elegibilidad (`src/lib/eligibility`)

Determinista, puro, sin I/O, 100% testeable (§13–§18). Orden de reglas por **prioridad**;
la primera que aplica define el motivo:

1. `HOST` / `CO_HOST` — por identidad Zoom (no anulable por reglas de nombre, §16)
2. `ADIPA` — nombre contiene "adipa", case/acento-insensible (§15)
3. `MANUAL_EXCLUDED` — decisión del operador
4. `PREVIOUS_WINNER` — ya ganó en esta reunión (§24)
5. `DUPLICATE_NAME` — nombre **textualmente idéntico** a otro (§17)
6. `DEVICE_NAME` / `INCOMPLETE_NAME` — el nombre no identifica a una persona (§13/§14)

`MANUAL_INCLUDED` sobrescribe 5 y 6, **nunca** 1 (Host/Co-Host es inanulable).

### Detección de nombre (§13/§14) — determinista y explicable
No es una blacklist. El algoritmo:
1. Normaliza (NFC, colapsa espacios, quita emojis y adornos).
2. **Extrae** los envoltorios de dispositivo conocidos en vez de rechazar:
   `"Android de X"` → `X` · `"iPhone de X"` → `X` · `"X's iPhone"` → `X` · `"Galaxy de X"` → `X`
3. Corta sufijos de contexto: `"Juan Pérez - Empresa"` → `"Juan Pérez"`.
4. Cuenta **tokens antropónimos**: ≥2 tokens que no sean marcas/dispositivos/conectores
   (`de`, `del`, `la`, `y`…) y que parezcan nombre (letras, ≥2 chars).
5. ≥2 tokens válidos → **elegible**; si no → `DEVICE_NAME` (si quedaba marca) o `INCOMPLETE_NAME`.

Cada participante guarda `evaluationTrace` (pasos aplicados) para poder explicar la decisión en UI.

## Motor de sorteo (`src/lib/draw`)

```ts
seleccionar(pool, n) → CSPRNG (crypto.randomInt) + Fisher–Yates parcial → n primeros
```
- `n = min(solicitados, pool.length)` (§23, sin error).
- Pool congelado al iniciar el sorteo, con hash persistido (§55).
- "Al agua" (§12): **no reconsulta Zoom**, usa el mismo `snapshotId`, quita al descalificado y
  re-sortea 1 ganador sobre el pool restante, registrando ambos eventos.

## Fuentes de participantes

`ZOOM_DASHBOARD` (principal) → `ZOOM_WEBHOOK_ROSTER` (si no hay Business+) → `EXCEL` (respaldo §20).
El Excel pasa por **el mismo motor de elegibilidad** (§21). Nunca se mezclan fuentes
automáticamente (§56); mezclar requiere acción explícita del operador.

## Contradicciones detectadas en el spec (§58)

| # | Contradicción | Resolución aplicada |
|---|---|---|
| 1 | §16 exige excluir Co-Host, pero la API de Zoom **no expone el rol** | Cascada de 6 mecanismos + aviso explícito al operador. Ver `00-ZOOM-RESEARCH.md §2`. |
| 2 | §17 excluye duplicados exactos, pero §51 dice `"Juan Pérez"` y `"juan pérez"` **ambos participan** | Comparación **byte-exacta** tras normalización NFC + colapso de espacios. Sin `toLowerCase`, sin quitar tildes. Consistente con ambos. |
| 3 | §15 excluye "ADIPA" case-insensitive, pero §17 compara duplicados case-**sensitive** | Son reglas distintas y ambas se implementan tal cual. Documentado para que no se "unifique" por error. |
| 4 | §11 dice que actualizar "reemplaza el universo" y a la vez "conserva snapshots anteriores" | El snapshot **activo** cambia; los anteriores quedan inmutables y consultables. Los sorteos ya ejecutados siguen apuntando a su snapshot original. |
| 5 | `estilo-comunicativo.md` **prohíbe** "sorteo" y "premio" (manda "otorgar beca, financiar"), pero todo el spec usa "sorteo" y "¡TENEMOS GANADOR!" | La UI interna del operador usa "Sorteo" (spec manda: es herramienta interna). El **comprobante JPG** es pieza de marca de cara al participante → su copy vive en i18n (`certificate.*`) con dos variantes listas: `winner` ("¡Tenemos ganador!") y `scholarship` ("Beca otorgada a"). **Requiere decisión de ADIPA**; por defecto queda `winner` según §31/§34. |
| 6 | §22 dice hasta 1.000 participantes; la API pagina de a 300 | 4 llamadas paginadas por extracción. Sin problema. |
| 7 | §6 asigna ADMIN por dominio, pero §5 dice que el Admin "administra operadores" | Un usuario de dominio ADIPA **siempre** es ADMIN (regla de sistema, no editable). Los operadores son cuentas de dominio externo creadas/invitadas por un admin. |

## Advertencias operativas

- **Plan Zoom:** las APIs de Dashboard requieren **Business o superior** con Dashboard habilitado.
  Si las cuentas de ADIPA son Pro, la fuente principal no funcionará y la app operará con
  roster de webhooks. **Confirmar el plan antes de producción.**
- **Latencia Dashboard:** el snapshot refleja lo que Zoom reporta en ese instante, con un desfase
  posible de decenas de segundos para reciéns ingresados.
