import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COUNTDOWN_SECONDS,
  MAX_WINNERS_PER_DRAW,
  hashPool,
  normalizeCountdown,
  normalizeWinnerCount,
  pickRandom,
  redrawOne,
  runDraw,
} from './engine';

const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Persona ${i}` }));

describe('seccion 23 - cantidad de ganadores', () => {
  it('el valor por defecto es 1 ganador', () => {
    expect(runDraw({ pool: pool(10), requestedWinners: 1 }).actualWinners).toBe(1);
  });

  it('entrega solo los disponibles si se piden mas que elegibles, sin error', () => {
    const r = runDraw({ pool: pool(3), requestedWinners: 10 });
    expect(r.actualWinners).toBe(3);
    expect(r.winners).toHaveLength(3);
  });

  it('nunca supera el maximo de 20 ganadores', () => {
    expect(normalizeWinnerCount(50, 100)).toBe(MAX_WINNERS_PER_DRAW);
  });

  it('corrige valores invalidos a 1', () => {
    expect(normalizeWinnerCount(0, 10)).toBe(1);
    expect(normalizeWinnerCount(-5, 10)).toBe(1);
    expect(normalizeWinnerCount(Number.NaN, 10)).toBe(1);
  });

  it('con pool vacio no hay ganadores', () => {
    const r = runDraw({ pool: [], requestedWinners: 3 });
    expect(r.winners).toHaveLength(0);
    expect(r.actualWinners).toBe(0);
  });
});

describe('seccion 26 - cuenta regresiva', () => {
  it('el valor por defecto es 5 segundos', () => {
    expect(DEFAULT_COUNTDOWN_SECONDS).toBe(5);
    expect(normalizeCountdown(0)).toBe(5);
    expect(normalizeCountdown(-3)).toBe(5);
  });

  it('acepta un tiempo manual positivo y acota valores absurdos', () => {
    expect(normalizeCountdown(45)).toBe(45);
    expect(normalizeCountdown(99999)).toBe(600);
  });
});

describe('seccion 25 - aleatoriedad', () => {
  it('no repite ganadores dentro de un mismo sorteo', () => {
    const r = runDraw({ pool: pool(50), requestedWinners: 20 });
    expect(new Set(r.winners.map((w) => w.id)).size).toBe(20);
  });

  it('todos los ganadores pertenecen al pool', () => {
    const p = pool(30);
    const ids = new Set(p.map((e) => e.id));
    for (const w of runDraw({ pool: p, requestedWinners: 10 }).winners) {
      expect(ids.has(w.id)).toBe(true);
    }
  });

  it('produce resultados distintos entre ejecuciones', () => {
    const p = pool(200);
    const results = new Set(
      Array.from({ length: 20 }, () => runDraw({ pool: p, requestedWinners: 1 }).winners[0].id),
    );
    expect(results.size).toBeGreaterThan(1);
  });

  it('la distribucion es razonablemente uniforme', () => {
    const p = pool(10);
    const counts = new Map<string, number>();
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
      const id = pickRandom(p, 1)[0].id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const expected = runs / 10;
    expect(counts.size).toBe(10);
    for (const c of counts.values()) {
      // Tolerancia amplia: detecta sesgo estructural, no ruido estadistico.
      expect(Math.abs(c - expected) / expected).toBeLessThan(0.2);
    }
  });
});

describe('seccion 55 - integridad y auditoria', () => {
  it('el hash del pool no depende del orden de las filas', () => {
    const p = pool(20);
    expect(hashPool(p)).toBe(hashPool([...p].reverse()));
  });

  it('pools distintos producen hashes distintos', () => {
    expect(hashPool(pool(20))).not.toBe(hashPool(pool(21)));
  });

  it('cada sorteo registra tamano de pool, hash y entropia', () => {
    const r = runDraw({ pool: pool(15), requestedWinners: 2 });
    expect(r.poolSize).toBe(15);
    expect(r.poolHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.seedEntropy).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('seccion 12 - Al agua', () => {
  it('elige un reemplazo del mismo pool excluyendo al descalificado', () => {
    const p = pool(5);
    const nuevo = redrawOne(p, ['p0']);
    expect(nuevo).not.toBeNull();
    expect(nuevo!.id).not.toBe('p0');
  });

  it('excluye acumulativamente a todos los enviados al agua', () => {
    const p = pool(4);
    const nuevo = redrawOne(p, ['p0', 'p1', 'p2']);
    expect(nuevo!.id).toBe('p3');
  });

  it('devuelve null cuando ya no queda nadie', () => {
    expect(redrawOne(pool(2), ['p0', 'p1'])).toBeNull();
  });

  it('no modifica el pool original', () => {
    const p = pool(5);
    const copia = [...p];
    redrawOne(p, ['p0']);
    expect(p).toEqual(copia);
  });
});

describe('seccion 24 - multiples sorteos', () => {
  it('los ganadores anteriores no vuelven a ganar', () => {
    let disponible = pool(3);
    const ganadores: string[] = [];

    for (let sorteo = 1; sorteo <= 3; sorteo++) {
      const r = runDraw({ pool: disponible, requestedWinners: 1 });
      const ganador = r.winners[0].id;
      expect(ganadores).not.toContain(ganador);
      ganadores.push(ganador);
      disponible = disponible.filter((e) => e.id !== ganador);
    }

    expect(new Set(ganadores).size).toBe(3);
  });
});
