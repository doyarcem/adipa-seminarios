[README.md](https://github.com/user-attachments/files/32295954/README.md)
# Sorteos ADIPA

Aplicación web para realizar **sorteos en vivo** durante los seminarios de Zoom de ADIPA. Un operador extrae la lista de participantes conectados a una reunión, la aplicación aplica reglas de elegibilidad determinísticas, sortea ganadores con un generador criptográficamente seguro y emite un comprobante (JPG) y un registro auditable de cada sorteo.

> El nombre interno del paquete es `adipa-sorteos`.

## Índice

- [Qué hace](#qué-hace)
- [Stack tecnológico](#stack-tecnológico)
- [Requisitos previos](#requisitos-previos)
- [Puesta en marcha rápida (modo simulador)](#puesta-en-marcha-rápida-modo-simulador)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Modelo de datos](#modelo-de-datos)
- [Motor de elegibilidad y sorteo](#motor-de-elegibilidad-y-sorteo)
- [Roles y autenticación](#roles-y-autenticación)
- [Internacionalización](#internacionalización)
- [Tests](#tests)
- [Seguridad](#seguridad)
- [Estado del proyecto](#estado-del-proyecto)
- [Documentación adicional](#documentación-adicional)

## Qué hace

Flujo típico del operador:

```
Login → Seleccionar reunión → Extraer participantes → Revisar → Configurar → Sortear
     → Cuenta regresiva → Ruleta → Ganador → (opcional) Al agua → Validar
```

- Extrae participantes conectados a una reunión de Zoom (Dashboard API) o los carga desde un Excel de respaldo.
- Aplica un motor de elegibilidad determinista (excluye host/co-host, cuentas ADIPA, nombres de dispositivo, duplicados, ganadores previos de la misma reunión, etc.).
- Sortea con `crypto.randomInt` (CSPRNG) + Fisher–Yates, nunca `Math.random()`.
- Congela el universo de participantes en un `Snapshot` **inmutable**; cada `Draw` queda ligado a ese snapshot y a un hash del pool elegible, de modo que el resultado es reconstruible y auditable.
- Permite "al agua" (descalificar y volver a sortear) sin reconsultar Zoom.
- Genera un comprobante en JPG renderizado en servidor (idéntico en cualquier navegador) y permite exportar resultados a Excel.
- Vista de administrador para cuentas Zoom, usuarios y (en progreso) historial/auditoría global.

## Stack tecnológico

| Capa | Elección |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + Poppins + Phosphor Icons |
| Base de datos | PostgreSQL (compatible con Supabase/Neon) vía Prisma |
| Autenticación | Auth.js v5 (Google OAuth para administradores, Zoom OAuth para operadores) |
| Aleatoriedad | `crypto.randomInt` + Fisher–Yates (nunca `Math.random()`) |
| Excel | ExcelJS (lectura de BDD manual y exportación de resultados) |
| Generación de imágenes | `@napi-rs/canvas` (comprobante JPG renderizado en servidor) |
| i18n | next-intl (`messages/es.json`, `messages/en.json`) |
| Tests | Vitest |

Ver el detalle y las decisiones de arquitectura en [`docs/01-ARQUITECTURA.md`](docs/01-ARQUITECTURA.md).

## Requisitos previos

- Node.js 20+ y npm
- Para producción: una base de datos PostgreSQL (Neon/Supabase recomendado) y credenciales OAuth de Google y de Zoom
- Para desarrollo local **no se necesita nada de lo anterior**: la app incluye un simulador de Zoom y un modo de autenticación sin credenciales (ver siguiente sección)

## Puesta en marcha rápida (modo simulador)

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000) e iniciar sesión con cualquier correo:

- `algo@adipa.cl` → entra como **ADMINISTRADOR** (regla de dominio)
- `sala1.virtualys@gmail.com` → entra como **OPERADOR**

En este modo no se requiere Zoom ni base de datos: `ZOOM_MODE=simulator` y `AUTH_DEV_MODE=true` hacen que los datos vivan en memoria del servidor (se pierden al reiniciarlo).

### Puesta en marcha con base de datos e integraciones reales

1. Copiar `.env.example` a `.env.local` y completar las variables (ver más abajo).
2. Generar el cliente de Prisma y sincronizar el esquema:

   ```bash
   npm run db:generate
   npm run db:push      # o npm run db:migrate en desarrollo
   ```

3. (Opcional) Poblar datos iniciales:

   ```bash
   npm run db:seed
   ```

4. Levantar la app:

   ```bash
   npm run dev
   ```

## Variables de entorno

Todas las variables están documentadas con su propósito en [`.env.example`](.env.example). Resumen:

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Conexión agrupada (pooler) a PostgreSQL, la que usa la app en cada petición |
| `DIRECT_URL` | Conexión directa, solo para migraciones de Prisma |
| `AUTH_SECRET`, `AUTH_URL` | Configuración de Auth.js |
| `AUTH_BYPASS` | Salta el login por completo en desarrollo (requiere `NODE_ENV != production`) |
| `AUTH_DEV_MODE`, `DEMO_LOGIN_ACCOUNTS` | Login manual con cuentas de prueba, solo desarrollo |
| `ALLOW_DEMO_LOGIN_IN_PRODUCTION` | Segundo candado obligatorio para habilitar el login de demostración en producción |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Login de administradores vía Google (solo dominios `@adipa.cl` / `@adipa.co` / `@adipa.mx`) |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI` | App OAuth de Zoom (login de operadores y vinculación de cuentas) |
| `ZOOM_WEBHOOK_SECRET_TOKEN` | Validación de firma de los webhooks entrantes de Zoom |
| `ZOOM_TOKEN_ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar en reposo los tokens de Zoom guardados en BD |
| `ADIPA_ADMIN_DOMAINS` | Dominios de correo que reciben el rol ADMINISTRADOR automáticamente |

La aplicación **no almacena contraseñas** de cuentas Zoom ni de Google: toda la autenticación es OAuth, la app solo recibe tokens revocables. Ningún endpoint devuelve `access_token`, `refresh_token`, `client_secret` ni `account_id` al navegador.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta la app en desarrollo (puerto 3000) |
| `npm run build` | Genera el cliente de Prisma, aplica migraciones si hay config, y compila para producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | Lint con `next lint` |
| `npm run typecheck` | Chequeo de tipos con `tsc --noEmit` |
| `npm test` | Corre la suite de tests con Vitest |
| `npm run test:watch` | Tests en modo watch |
| `npm run db:generate` | Genera el cliente de Prisma |
| `npm run db:push` | Sincroniza el esquema de Prisma con la base sin generar migración |
| `npm run db:migrate` | Crea/aplica una migración en desarrollo |
| `npm run db:deploy` | Aplica migraciones en producción |
| `npm run db:seed` | Ejecuta el seed (`prisma/seed.ts`) |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run sounds` | Genera los efectos de sonido usados en la pantalla de sorteo |

## Estructura del proyecto

```
src/
  app/                # Rutas (App Router): login, monitor/sorteo, admin, API routes
  components/
    draw/              # UI de la pantalla de sorteo (ruleta, cuenta regresiva, ganador)
    operator/          # UI del flujo de operador
  lib/
    auth/              # Resolución de rol y sesión
    crypto/            # Cifrado de tokens Zoom (AES-256-GCM)
    draw/               # Motor de sorteo (CSPRNG + Fisher–Yates)
    eligibility/        # Motor de elegibilidad, determinista y puro
    certificate/         # Generación del comprobante JPG en servidor
    excel/               # Lectura de BDD manual y exportación de resultados
    zoom/                # Cliente de la API de Zoom (y simulador)
  server/
    actions/             # Server Actions
    services/            # Lógica de negocio del servidor
    store/                # Interfaz de almacenamiento (en memoria / Prisma)
  i18n/                  # Configuración de next-intl
prisma/
  schema.prisma          # Modelo de datos
  seed.ts                 # Datos iniciales
messages/
  es.json, en.json        # Textos de la interfaz
docs/                     # Documentación de investigación, arquitectura y estado
scripts/                   # Scripts de soporte (sonidos, migraciones, etc.)
test/                       # Tests (Vitest)
```

## Modelo de datos

Entidades principales (`prisma/schema.prisma`): `User`, `ZoomAccount`, `Meeting`, `Snapshot`, `SnapshotParticipant`, `Draw`, `DrawWinner`, `ManualOverride`, `AuditLog`, `Certificate`.

Principio rector: **los snapshots y los sorteos son inmutables una vez creados**. Nada en el esquema permite reescribir la historia de un sorteo:

- `Snapshot` nunca se edita; "actualizar participantes" crea un snapshot nuevo y conserva el anterior.
- `Draw` guarda `snapshotId`, `eligiblePoolHash` (SHA-256 del pool ordenado), la semilla de aleatoriedad y su configuración, de modo que el resultado sea reconstruible y auditable.
- `DrawWinner` es una fila por ganador, con estado `PENDING` | `VALIDATED` | `AL_AGUA`.

## Motor de elegibilidad y sorteo

El motor de elegibilidad (`src/lib/eligibility`) es determinista, puro y sin I/O. Evalúa, en orden de prioridad, la primera regla que aplica:

1. `HOST` / `CO_HOST` — por identidad Zoom (no anulable)
2. `ADIPA` — el nombre contiene "adipa" (case/acento-insensible)
3. `MANUAL_EXCLUDED` — decisión del operador
4. `PREVIOUS_WINNER` — ya ganó en esta misma reunión
5. `DUPLICATE_NAME` — nombre textualmente idéntico a otro
6. `DEVICE_NAME` / `INCOMPLETE_NAME` — el nombre no identifica a una persona

Cada participante conserva un `evaluationTrace` para poder explicar la decisión en la interfaz.

El sorteo (`src/lib/draw`) selecciona `n = min(solicitados, pool.length)` ganadores usando `crypto.randomInt` + Fisher–Yates parcial sobre un pool congelado. La función "al agua" descalifica a un ganador y re-sortea sobre el pool restante sin volver a consultar Zoom, registrando ambos eventos.

Más detalle, incluyendo las contradicciones detectadas en el spec original y cómo se resolvieron, en [`docs/01-ARQUITECTURA.md`](docs/01-ARQUITECTURA.md).

## Roles y autenticación

- El rol (`ADMIN` / `OPERATOR`) se resuelve **solo en servidor**, a partir del dominio del correo verificado; nunca se acepta desde el cliente.
- Administradores: inician sesión con Google, restringido a los dominios listados en `ADIPA_ADMIN_DOMAINS` (`adipa.cl`, `adipa.co`, `adipa.mx` por defecto).
- Operadores: inician sesión con Zoom (misma app OAuth de Zoom Marketplace).
- Modo de desarrollo: `AUTH_DEV_MODE=true` habilita un login manual restringido a las cuentas listadas en `DEMO_LOGIN_ACCOUNTS`. En producción requiere además `ALLOW_DEMO_LOGIN_IN_PRODUCTION=true` (segundo candado) y la interfaz muestra una franja de aviso permanente.
- `AUTH_BYPASS=true` salta el login por completo (solo funciona si `NODE_ENV` no es `production`).

## Internacionalización

Los textos viven en `messages/es.json` y `messages/en.json` vía `next-intl`; no hay texto de interfaz hardcodeado en los componentes.

## Tests

```bash
npm test        # una corrida
npm run test:watch
```

La suite (Vitest) cubre, entre otros: el motor de elegibilidad, el motor de sorteo, el cliente/simulador de Zoom, roles y permisos, el flujo completo de integración, paridad de textos es/en, el comprobante JPG y la exportación a Excel. Ver el detalle en [`docs/02-ESTADO.md`](docs/02-ESTADO.md).

## Seguridad

- Ningún endpoint devuelve tokens ni secretos de Zoom al navegador.
- Los tokens de Zoom se cifran en reposo con AES-256-GCM (`ZOOM_TOKEN_ENCRYPTION_KEY`); rotar la clave invalida los tokens guardados.
- Toda ruta protegida pasa por `requireRole('ADMIN' | 'OPERATOR')` en servidor.
- `.env*` está excluido del repositorio (salvo `.env.example`, sin secretos).
- La app no almacena contraseñas de cuentas Zoom ni Google: toda la autenticación es OAuth.

## Estado del proyecto

El flujo de operador está **completo y verificado de punta a punta** (probado en navegador con 486 participantes simulados). Pendiente, fuera de ese flujo:

1. Carga de BDD manual por Excel
2. Vista de administrador completa (cuentas Zoom, usuarios, historial global, auditoría) — hoy existe una versión mínima
3. Flujo OAuth de vinculación de cuentas Zoom
4. Receptor de webhooks con validación HMAC
5. `PrismaDrawStore`: implementación de la interfaz `DrawStore` contra Postgres

**Bloqueado:** las credenciales de la app OAuth de Zoom (`ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`) aún no están disponibles; mientras tanto el simulador de Zoom cubre todo el flujo de desarrollo. Detalle completo en [`docs/02-ESTADO.md`](docs/02-ESTADO.md).

## Documentación adicional

- [`docs/00-ZOOM-RESEARCH.md`](docs/00-ZOOM-RESEARCH.md) — investigación sobre las APIs de Zoom
- [`docs/01-ARQUITECTURA.md`](docs/01-ARQUITECTURA.md) — decisiones de arquitectura y stack
- [`docs/02-ESTADO.md`](docs/02-ESTADO.md) — estado de la implementación, cómo correrlo y pendientes
