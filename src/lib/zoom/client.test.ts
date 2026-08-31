import { describe, expect, it, vi } from 'vitest';
import { ZoomClient, encodeMeetingIdentifier, type ZoomTokenStore, type ZoomTokens } from './client';
import { ZoomApiError, mapZoomHttpError } from './errors';

function makeStore(initial?: Partial<ZoomTokens>) {
  const state: ZoomTokens = {
    accessToken: 'access-inicial',
    refreshToken: 'refresh-inicial',
    expiresAt: new Date(Date.now() + 3_600_000),
    ...initial,
  };
  const saved: ZoomTokens[] = [];
  const reauth: string[] = [];

  const store: ZoomTokenStore = {
    load: async () => state,
    save: async (t) => {
      Object.assign(state, t);
      saved.push({ ...t });
    },
    markNeedsReauth: async (reason) => {
      reauth.push(reason);
    },
  };

  return { store, state, saved, reauth };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let accountCounter = 0;
function makeClient(fetchImpl: typeof fetch, store: ZoomTokenStore) {
  return new ZoomClient({
    accountKey: `cuenta-${accountCounter++}`,
    store,
    clientId: 'cid',
    clientSecret: 'csecret',
    fetchImpl,
  });
}

describe('paginacion (seccion 22 - hasta 1.000 participantes)', () => {
  it('recorre todas las paginas hasta agotar next_page_token', async () => {
    const page = (n: number, token?: string) =>
      json({
        participants: Array.from({ length: 300 }, (_, i) => ({ user_name: `P${n}-${i}` })),
        next_page_token: token ?? '',
      });

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page(1, 't2'))
      .mockResolvedValueOnce(page(2, 't3'))
      .mockResolvedValueOnce(page(3, 't4'))
      .mockResolvedValueOnce(json({ participants: [{ user_name: 'ultimo' }], next_page_token: '' }));

    const { store } = makeStore();
    const participants = await makeClient(fetchImpl, store).listLiveParticipants('abc==');

    expect(participants).toHaveLength(901);
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    const firstUrl = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(firstUrl.searchParams.get('page_size')).toBe('300');
    expect(firstUrl.searchParams.get('type')).toBe('live');

    const secondUrl = new URL(String(fetchImpl.mock.calls[1][0]));
    expect(secondUrl.searchParams.get('next_page_token')).toBe('t2');
  });

  it('pide type=live y el rango de hoy al listar reuniones', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ meetings: [], next_page_token: '' }));
    const { store } = makeStore();
    await makeClient(fetchImpl, store).listLiveMeetings();

    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/v2/metrics/meetings');
    expect(url.searchParams.get('type')).toBe('live');
    expect(url.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('UUID de instancia de reunion', () => {
  it('aplica doble encoding cuando el UUID lo requiere', () => {
    expect(encodeMeetingIdentifier('abc123==')).toBe('abc123%3D%3D');
    expect(encodeMeetingIdentifier('/abc==')).toBe('%252Fabc%253D%253D');
    expect(encodeMeetingIdentifier('ab//cd')).toBe('ab%252F%252Fcd');
  });
});

describe('rotacion de tokens', () => {
  it('refresca cuando el token esta por expirar y guarda el refresh ROTADO', async () => {
    const { store, saved } = makeStore({ expiresAt: new Date(Date.now() + 5_000) });

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({ access_token: 'access-nuevo', refresh_token: 'refresh-rotado', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ meetings: [], next_page_token: '' }));

    await makeClient(fetchImpl, store).listLiveMeetings();

    expect(saved).toHaveLength(1);
    expect(saved[0].refreshToken).toBe('refresh-rotado');
    expect(saved[0].accessToken).toBe('access-nuevo');

    const apiCall = fetchImpl.mock.calls[1];
    const headers = apiCall[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer access-nuevo');
  });

  it('un 401 dispara exactamente un refresh y reintenta', async () => {
    const { store, saved } = makeStore();

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ code: 124, message: 'Invalid access token' }, 401))
      .mockResolvedValueOnce(
        json({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ meetings: [{ uuid: 'u1' }], next_page_token: '' }));

    const meetings = await makeClient(fetchImpl, store).listLiveMeetings();

    expect(meetings).toHaveLength(1);
    expect(saved).toHaveLength(1);
  });

  it('marca la cuenta para re-autenticar si el refresh falla', async () => {
    const { store, reauth } = makeStore({ refreshToken: null, expiresAt: new Date(Date.now() - 1000) });
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(makeClient(fetchImpl, store).listLiveMeetings()).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
    expect(reauth).toHaveLength(1);
  });

  it('no lanza dos refrescos en paralelo para la misma cuenta', async () => {
    const { store, saved } = makeStore({ expiresAt: new Date(Date.now() - 1000) });

    let refreshCalls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('oauth/token')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 });
      }
      return json({ meetings: [], next_page_token: '' });
    });

    const client = makeClient(fetchImpl, store);
    await Promise.all([client.listLiveMeetings(), client.listLiveMeetings(), client.listLiveMeetings()]);

    expect(refreshCalls).toBe(1);
    expect(saved).toHaveLength(1);
  });
});

describe('reintentos y errores (seccion 41)', () => {
  it('reintenta ante 5xx y termina exitosamente', async () => {
    const { store } = makeStore();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ message: 'boom' }, 503))
      .mockResolvedValueOnce(json({ meetings: [{ uuid: 'ok' }], next_page_token: '' }));

    const meetings = await makeClient(fetchImpl, store).listLiveMeetings();
    expect(meetings).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('no reintenta cuando el error no es reintentable', async () => {
    const { store } = makeStore();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ code: 3001, message: 'Meeting does not exist' }, 404));

    await expect(makeClient(fetchImpl, store).listLiveParticipants('u1')).rejects.toMatchObject({
      code: 'MEETING_NOT_FOUND',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('convierte un timeout en TIMEOUT reintentable', async () => {
    const { store } = makeStore();
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(abort);

    await expect(makeClient(fetchImpl, store).listLiveMeetings()).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('mapeo de errores de Zoom', () => {
  it('distingue plan insuficiente de falta de scopes', () => {
    expect(mapZoomHttpError(400, { code: 200, message: 'This API requires a Business plan' }, '').code).toBe(
      'PLAN_NOT_SUPPORTED',
    );
    expect(mapZoomHttpError(403, { code: 200, message: 'No permission' }, '').code).toBe('FORBIDDEN');
  });

  it('distingue el limite por segundo del limite diario', () => {
    const perSecond = mapZoomHttpError(429, { message: 'maximum per-second rate limit' }, '');
    expect(perSecond.retryable).toBe(true);

    const daily = mapZoomHttpError(429, { message: 'maximum daily rate limit' }, '');
    expect(daily.retryable).toBe(false);
  });

  it('el payload al cliente no filtra detalle tecnico', () => {
    const err = new ZoomApiError({ code: 'FORBIDDEN', technicalDetail: 'Bearer secreto-xyz rechazado' });
    const payload = err.toClientPayload();
    expect(JSON.stringify(payload)).not.toContain('secreto-xyz');
    expect(payload.code).toBe('FORBIDDEN');
  });
});
