/**
 * Fabricas de infraestructura.
 *
 * Un unico lugar decide que implementacion concreta se usa. El resto de la
 * aplicacion pide `getStore()` o `getZoomProvider()` y no sabe -ni le importa-
 * si detras hay Postgres o memoria, Zoom real o simulador.
 */

import 'server-only';
import { ZoomSimulator, type SimulatorConfig } from '@/lib/zoom/simulator';
import { getZoomMode, hasLiveCredentials, type ZoomProvider } from '@/lib/zoom/provider';
import { MemoryDrawStore } from './store/memory';
import type { DrawStore } from './store/types';

// ─────────────────────────── persistencia ───────────────────────────

let storeInstance: DrawStore | null = null;

/**
 * Hoy siempre devuelve el almacen en memoria.
 *
 * Para conectar Postgres: escribir `PrismaDrawStore implements DrawStore` y
 * devolverlo aqui cuando exista DATABASE_URL. Ni los servicios ni las pantallas
 * cambian.
 */
export function getStore(): DrawStore {
  if (!storeInstance) storeInstance = new MemoryDrawStore();
  return storeInstance;
}

/** true si los datos se pierden al reiniciar. La UI lo avisa al operador. */
export function isEphemeralStore(): boolean {
  return true;
}

// ─────────────────────────── Zoom ───────────────────────────

export interface ZoomAccountRef {
  id: string;
  displayName: string;
}

/** Configuracion del simulador ajustable por entorno, para demos y pruebas. */
function simulatorConfigFromEnv(): Partial<SimulatorConfig> {
  const num = (key: string) => {
    const raw = process.env[key];
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    liveMeetings: num('ZOOM_SIM_MEETINGS') ?? 3,
    participantsPerMeeting: num('ZOOM_SIM_PARTICIPANTS') ?? 486,
    seed: num('ZOOM_SIM_SEED') ?? 20260831,
    latencyMs: num('ZOOM_SIM_LATENCY_MS') ?? 350,
    fault: (process.env.ZOOM_SIM_FAULT as SimulatorConfig['fault']) || null,
  };
}

/**
 * Devuelve el proveedor de Zoom para una cuenta.
 *
 * En modo simulador se ignora la cuenta: hay una sola organizacion simulada.
 * En modo real habra que construir un ZoomClient con el token store de esa cuenta.
 */
export function getZoomProvider(_accountId?: string): ZoomProvider {
  if (getZoomMode() === 'simulator') {
    return new ZoomSimulator(simulatorConfigFromEnv());
  }

  if (!hasLiveCredentials()) {
    throw new Error(
      'No hay credenciales de Zoom configuradas. Define ZOOM_CLIENT_ID y ZOOM_CLIENT_SECRET, ' +
        'o ejecuta con ZOOM_MODE=simulator.',
    );
  }

  // Pendiente: construir ZoomClient con PrismaZoomTokenStore para la cuenta indicada.
  // Requiere las credenciales del Marketplace y la base de datos.
  throw new Error('El cliente Zoom real aun no esta conectado. Usa ZOOM_MODE=simulator.');
}

/** Cuentas Zoom disponibles. En simulador, la organizacion ficticia. */
export function listZoomAccounts(): ZoomAccountRef[] {
  if (getZoomMode() === 'simulator') {
    const info = ZoomSimulator.accountInfo();
    return [{ id: info.zoomAccountId, displayName: info.displayName }];
  }
  return [];
}

export function isSimulatorMode(): boolean {
  return getZoomMode() === 'simulator';
}
