# Estado de la implementación

Actualizado: 2026-08-31

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

Abrir http://localhost:3000 y entrar con cualquier correo:

- `algo@adipa.cl` → **ADMINISTRADOR** (regla de dominio, §6)
- `sala1.virtualys@gmail.com` → **OPERADOR**

No requiere Zoom ni base de datos: `.env.local` trae `ZOOM_MODE=simulator` y
`AUTH_DEV_MODE=true`. Los datos viven en memoria del servidor y se pierden al reiniciarlo.

## Flujo del operador: funcionando de punta a punta

```
Login → Seleccionar reunión → Extraer → Revisar → Configurar → Sortear
     → Cuenta regresiva → Ruleta → Ganador → Al agua → Validar
```

Verificado en navegador con 486 participantes simulados.

## Decisiones confirmadas por ADIPA

| Tema | Decisión |
|---|---|
| Co-Host (§16) | Cascada de 6 mitigaciones + aviso explícito al operador |
| Plan Zoom | Una organización Business: se vincula una vez, Dashboard API disponible |
| Login | Operadores con Zoom, administradores con Google. Ninguna contraseña en la app |
| Logo | No se usa. UI y comprobante se apoyan en color y tipografía de marca |
| Copy del comprobante | Lenguaje de marca: "Beca otorgada a…" |
| Sonidos | Generados por la aplicación (`npm run sounds`) |
| Credenciales Zoom | Bloqueadas → se construyó un simulador completo |
| Base de datos | Sin base por ahora → almacén en memoria detrás de una interfaz |

## Nota de seguridad

Las contraseñas de las 17 cuentas de sala se compartieron por chat y **deben rotarse**.
La aplicación no las usa ni las almacena: toda la autenticación es OAuth.

## Completado — 175 tests

| Módulo | Tests |
|---|---|
| Motor de elegibilidad (§13–§19, §51) | 47 |
| Motor de sorteo (§12, §23–§26, §55) | 19 |
| Cliente Zoom (§41, §42, §53, §54) | 13 |
| Simulador de Zoom | 23 |
| Roles y permisos (§5, §6, §40) | 28 |
| Flujo completo, integración (§62) | 21 |
| Paridad i18n es/en (§47) | 8 |
| Comprobante JPG (§34) | 8 |
| Exportación XLSX (§36) | 8 |

Además, sin tests propios: autenticación, almacén en memoria, esqueleto Next.js, tokens de
marca, pantallas de operador y de sorteo, efectos de sonido.

### Tipografía del comprobante

`public/fonts/` incluye Poppins Regular/SemiBold/Bold bajo licencia **SIL OFL 1.1**
(ver `public/fonts/OFL.txt`), que permite redistribución. Son necesarios para renderizar el
comprobante en servidor: sin archivo de fuente, el JPG saldría con una tipografía de sistema.

## Pendiente

El flujo del operador esta COMPLETO. Lo que queda esta fuera de ese flujo:

1. Carga de BDD manual por Excel (20, 21)
2. Vista Administrador completa: cuentas Zoom, usuarios, historial global, auditoria (7, 37, 38).
   Hoy existe una version minima para que el login de administrador no termine en 404.
3. Flujo OAuth de vinculacion de cuentas Zoom (7)
4. Receptor de webhooks con validacion HMAC
5. PrismaDrawStore: implementar la interfaz DrawStore contra Postgres

## Bloqueado

**Credenciales de la app OAuth de Zoom** (`ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`).

`marketplace.zoom.us` → Develop → Build App → **General App**, tipo *account-level*:

- Scopes: `dashboard_meetings:read:admin`, `meeting:read:admin`, `user:read:admin`
- Redirect URI login: `<AUTH_URL>/api/auth/callback/zoom`
- Redirect URI vinculación: `<AUTH_URL>/api/zoom/oauth/callback`
- Event notification endpoint: `<AUTH_URL>/api/zoom/webhook`

Mientras tanto el simulador cubre todo el flujo.
