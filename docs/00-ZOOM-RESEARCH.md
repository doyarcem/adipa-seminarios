# Investigación Zoom API — hallazgos verificados

> Fecha: 2026-08-31. Fuente: documentación oficial Zoom + esquemas del repo `zoom/api`.
> Este documento es la base técnica de la integración. **No inventar endpoints fuera de aquí.**

## 1. Endpoints que SÍ existen y sirven

### 1.1 Listar reuniones en vivo
```
GET https://api.zoom.us/v2/metrics/meetings?type=live&from=YYYY-MM-DD&to=YYYY-MM-DD&page_size=300
```
- **Scope:** `dashboard_meetings:read:admin`
- **Plan:** Business o superior (requiere Dashboard habilitado)
- **Rate limit label:** Heavy
- **Respuesta (por reunión):** `uuid`, `id`, `topic`, `host` (nombre del host), `email` (email del host),
  `user_type`, `start_time`, `end_time`, `duration`, `participants` (conteo), `has_*`
- Cubre §9 del spec: nombre de reunión, host, hora de inicio, conteo de participantes.
- `from`/`to` figuran como requeridos; para `type=live` se envían igual (día actual).
- **Alcance = toda la cuenta Zoom.** Una sola llamada por cuenta vinculada devuelve TODAS sus
  reuniones activas → resuelve §54 (una cuenta con varias reuniones simultáneas).

### 1.2 Listar participantes conectados AHORA
```
GET https://api.zoom.us/v2/metrics/meetings/{meetingId}/participants?type=live&page_size=300
```
- **Scope:** `dashboard_meetings:read:admin` · **Plan:** Business+ · **Label:** Heavy
- `page_size` default 30, **máximo 300** → 1.000 participantes = **4 llamadas** paginadas
  con `next_page_token` (expira en 15 min).
- `meetingId` acepta ID numérico o UUID. **Usar siempre el `uuid`** de la instancia: el ID numérico
  resuelve "la última instancia" y con reuniones recurrentes/simultáneas eso es ambiguo.
  El UUID debe ir **doble-URL-encoded** si empieza con `/` o contiene `//`.
- **Respuesta por participante:**
  `id`, `user_id`, `user_name`, `device`, `ip_address`, `location`, `network_type`,
  `microphone`, `speaker`, `data_center`, `connection_type`, `join_time`, `leave_time`,
  `share_application`, `share_desktop`, `share_whiteboard`, `recording`, `pc_name`,
  `domain`, `mac_addr`, `harddisk_id`, `version`

### 1.3 Detalle de la reunión (para identificar al host)
```
GET https://api.zoom.us/v2/meetings/{meetingId}     # scope meeting:read:admin
```
Devuelve `host_id`, `host_email`, `topic`, `settings.alternative_hosts`.

## 2. PROBLEMA CRÍTICO — Co-Host no es obtenible por API REST

**El requisito §16 ("excluir Host y Co-Host") NO es implementable tal cual.**

La respuesta de `/metrics/meetings/{id}/participants` **no incluye ningún campo `role`**
(ver esquema completo arriba). Los webhooks `meeting.participant_joined` tampoco lo incluyen.
No existe endpoint REST que devuelva el rol en-reunión de un participante.

**Agravante 1 - no hay email.** La respuesta de participantes tampoco incluye `email` (ver el
esquema completo arriba). Solo trae `user_id`. Por lo tanto **el cruce de identidad debe hacerse
por `user_id`, no por correo**: `settings.alternative_hosts` entrega EMAILS, que hay que resolver a
IDs con `GET /users` antes de poder compararlos con el roster. Sin ese paso intermedio los
co-anfitriones nunca se detectan, aunque esten bien declarados en Zoom.
Implementado en `src/lib/zoom/roleContext.ts`.

Agravante 2: Zoom **oculta por PII** los campos `id` y `participant_user_id` de los participantes
invitados (no-host) en las APIs de Dashboard y Report.

### Qué SÍ se puede hacer (implementado en esta app, en cascada)

| # | Mecanismo | Cubre | Confiabilidad |
|---|---|---|---|
| 1 | **Host por identidad**: comparar `email`/`user_id` del participante contra `host`/`email` de `/metrics/meetings/{id}` y `host_id`/`host_email` de `/meetings/{id}` | Host real | Alta |
| 2 | **Alternative hosts**: `GET /meetings/{id}` → `settings.alternative_hosts` (emails). Un alternative host se convierte en co-host al entrar | Co-hosts preconfigurados | Alta, pero parcial |
| 3 | **Miembros de la cuenta Zoom**: `GET /users?status=active` de la cuenta vinculada → cualquier participante cuyo `email` o `user_id` corresponda a un usuario interno se marca `STAFF` | Staff que entra logueado | Media-alta |
| 4 | **Regla ADIPA (§15)**: nombre contiene "adipa" → excluido | Staff que se identifica como ADIPA | Alta en la práctica |
| 5 | **Lista de co-hosts conocidos** por cuenta/reunión, editable por Administrador | Co-hosts promovidos en vivo | Depende de mantenimiento |
| 6 | **Exclusión manual del operador (§19)** | Todo lo demás | Última línea |

### Alternativa descartada para v1
**Zoom Meeting SDK / Zoom App in-client** sí expone roles en vivo. Requiere que la aplicación
corra **dentro del cliente Zoom del host** — cambia por completo la arquitectura, el modelo de
despliegue y la experiencia (el operador ya no opera desde el navegador compartiendo pantalla).
Se documenta como camino v2 si la exclusión de co-host promovido en vivo resulta insuficiente.

**Decisión:** el motor de elegibilidad marca `HOST` y `CO_HOST` con la evidencia disponible y
expone el nivel de confianza. La UI muestra un aviso explícito al operador:
*"Los co-anfitriones promovidos durante la reunión no son detectables por la API de Zoom.
Revisa la lista antes de sortear."*

## 3. Fuente alternativa en tiempo real: webhooks (roster propio)

Eventos `meeting.started`, `meeting.ended`, `meeting.participant_joined`,
`meeting.participant_left` permiten mantener un **roster en vivo propio** en nuestra BD.

- Scope: `meeting:read:admin` (no requiere Business+ ni Dashboard).
- Payload participante: `user_name`, `participant_user_id`, `user_id`, `email` (solo si entró logueado),
  `participant_uuid`, `join_time`. **Tampoco trae rol.**
- Ventaja: sin latencia de Dashboard, sin consumo de rate limit Heavy, funciona en planes Pro.
- Desventaja: solo ve gente que entra **después** de suscribir el webhook; requiere URL pública
  y validación HMAC del `crc` / header `x-zm-signature`.

**Se implementa como segunda fuente seleccionable** (`ZOOM_DASHBOARD` | `ZOOM_WEBHOOK_ROSTER` | `EXCEL`),
no como reemplazo. Si la cuenta no es Business+, la app degrada a roster de webhooks y lo dice.

## 4. Multi-cuenta (§54)

- **Elegido: OAuth 3-legged, app *account-level* del Marketplace.** Es el único flujo con
  "vincular / desvincular cuenta" real desde la UI (§7). Cada cuenta ADIPA instala la app una vez;
  guardamos `access_token` (1h) + `refresh_token` cifrados.
- ⚠️ **Zoom rota el refresh token en cada refresh**: hay que persistir el nuevo inmediatamente o
  la cuenta queda desvinculada. Refresh serializado con lock por cuenta para evitar carreras.
- Server-to-Server OAuth queda como modo alternativo (credenciales pegadas por el admin), útil si
  ADIPA prefiere no publicar app en Marketplace. Sin flujo de "vincular", pero mismo cliente HTTP.

## 5. Rate limits y errores

| Plan | Heavy |
|---|---|
| Pro | 10 req/s · 30.000/día combinado |
| Business+ | 40 req/s · 60.000/día combinado |

- 429 con dos mensajes distintos (por segundo vs. diario). Se distinguen y se traducen a mensajes
  del §41. Reintento con backoff exponencial + jitter, máx. 3 intentos, solo en 429/5xx/timeout.
- Timeout duro de 10s por request, 25s por operación de extracción completa.
- 401 → refresh token una vez → si vuelve a fallar, marcar cuenta `NEEDS_REAUTH` (§41 "Token expirado").
- 400 `code: 3001` = reunión no existe o ya terminó → mensaje "Reunión sin participantes / finalizada".

## 6. Latencia del Dashboard

Los datos de Dashboard son *near-realtime*, no instantáneos: alguien que entró hace ~30 s puede no
aparecer. El snapshot muestra la hora exacta de extracción y la UI advierte que refleja el estado
**al momento de presionar el botón** (coherente con §11/§12).
