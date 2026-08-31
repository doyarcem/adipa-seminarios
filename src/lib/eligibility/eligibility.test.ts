import { describe, expect, it } from 'vitest';
import { analyzeName } from './personName';
import { containsAdipa, evaluateParticipants } from './engine';
import { normalizeExact } from './normalize';
import type { RawParticipant } from './types';

const p = (displayName: string, extra: Partial<RawParticipant> = {}): RawParticipant => ({
  displayName,
  ...extra,
});

describe('seccion 13 - nombres validos del spec', () => {
  const validos = [
    'Juan Pérez',
    'Daniel Oyarce',
    'Nicole González',
    'Juan Pérez Rebolledo',
    'Juan Pérez - Empresa',
    "Juan Ramírez's iPhone",
    'Android de Daniel Oyarce',
    '😀 Juan Pérez',
  ];

  it.each(validos)('%s es ELEGIBLE', (name) => {
    expect(analyzeName(name).kind).toBe('PERSON');
  });

  it('extrae el nombre de persona del envoltorio de dispositivo', () => {
    expect(analyzeName('Android de Daniel Oyarce').personName).toBe('Daniel Oyarce');
    expect(analyzeName("Juan Ramírez's iPhone").personName).toBe('Juan Ramírez');
    expect(analyzeName('Juan Pérez - Empresa').personName).toBe('Juan Pérez');
    expect(analyzeName('😀 Juan Pérez').personName).toBe('Juan Pérez');
  });
});

describe('seccion 13 - nombres invalidos del spec', () => {
  const invalidos = ['Juan', 'Daniel', 'Nicole', 'iPhone', 'MacBook', 'Galaxy S24', 'Android', "Juan's iPhone"];

  it.each(invalidos)('%s NO es elegible', (name) => {
    expect(analyzeName(name).kind).not.toBe('PERSON');
  });

  it('distingue nombre incompleto de nombre de dispositivo', () => {
    expect(analyzeName('Juan').kind).toBe('INCOMPLETE');
    expect(analyzeName('Daniel').kind).toBe('INCOMPLETE');
    expect(analyzeName('iPhone').kind).toBe('DEVICE');
    expect(analyzeName('MacBook').kind).toBe('DEVICE');
    expect(analyzeName('Galaxy S24').kind).toBe('DEVICE');
    expect(analyzeName('Android').kind).toBe('DEVICE');
    expect(analyzeName("Juan's iPhone").kind).toBe('DEVICE');
  });
});

describe('seccion 14 - la deteccion es contextual, no una blacklist', () => {
  it('el mismo termino de dispositivo excluye o no segun el contexto', () => {
    expect(analyzeName('Android').kind).toBe('DEVICE');
    expect(analyzeName('Android de Daniel Oyarce').kind).toBe('PERSON');
    expect(analyzeName("Juan's iPhone").kind).toBe('DEVICE');
    expect(analyzeName("Juan Ramírez's iPhone").kind).toBe('PERSON');
  });

  it('acepta particulas dentro del nombre', () => {
    expect(analyzeName('Juan de la Cruz').kind).toBe('PERSON');
    expect(analyzeName('Juan de la Cruz').personName).toBe('Juan de la Cruz');
  });

  it('rechaza un nombre compuesto solo por particulas', () => {
    expect(analyzeName('de la').kind).toBe('INCOMPLETE');
  });
});

describe('seccion 15 - regla ADIPA', () => {
  it.each(['ADIPA', 'adipa', 'Adipa', 'aDiPa', 'Soporte ADIPA', 'Camila Adipa Chile'])(
    '%s contiene ADIPA',
    (name) => {
      expect(containsAdipa(name)).toBe(true);
    },
  );

  it('excluye aunque el nombre sea valido como persona', () => {
    const r = evaluateParticipants([p('Camila Adipa Rojas')]);
    expect(r.participants[0].eligible).toBe(false);
    expect(r.participants[0].exclusionReason).toBe('ADIPA_NAME');
  });

  it('no excluye nombres que no la contienen', () => {
    expect(containsAdipa('Juan Pérez')).toBe(false);
  });
});

describe('seccion 16 - Host y Co-Host', () => {
  const ctx = {
    hostEmail: 'host@adipa.cl',
    alternativeHostEmails: ['cohost@ejemplo.com'],
    knownCoHostEmails: ['promovido@ejemplo.com'],
  };

  it('excluye al host por email', () => {
    const r = evaluateParticipants([p('Maria Gonzalez', { email: 'HOST@Adipa.CL' })], ctx);
    expect(r.participants[0].detectedRole).toBe('HOST');
    expect(r.participants[0].exclusionReason).toBe('HOST');
  });

  it('excluye al co-host declarado como alternative host', () => {
    const r = evaluateParticipants([p('Pedro Soto', { email: 'cohost@ejemplo.com' })], ctx);
    expect(r.participants[0].exclusionReason).toBe('CO_HOST');
  });

  it('excluye al co-host de la lista mantenida por el administrador', () => {
    const r = evaluateParticipants([p('Ana Ruiz', { email: 'promovido@ejemplo.com' })], ctx);
    expect(r.participants[0].exclusionReason).toBe('CO_HOST');
  });

  it('la exclusion de host NO se puede revertir manualmente', () => {
    const r = evaluateParticipants([p('Maria Gonzalez', { externalId: 'u1', email: 'host@adipa.cl' })], {
      ...ctx,
      manualOverrides: { u1: true },
    });
    expect(r.participants[0].eligible).toBe(false);
    expect(r.participants[0].trace).toContain('override.rejected:roleLocked');
  });

  it('marca STAFF sin excluirlo automaticamente', () => {
    const r = evaluateParticipants([p('Rosa Lira', { email: 'staff@empresa.com' })], {
      accountMemberEmails: ['staff@empresa.com'],
    });
    expect(r.participants[0].detectedRole).toBe('STAFF');
    expect(r.participants[0].eligible).toBe(true);
  });
});

describe('seccion 17 y 51 - duplicados', () => {
  it('excluye nombres textualmente identicos', () => {
    const r = evaluateParticipants([p('Juan Pérez'), p('Juan Pérez')]);
    expect(r.participants.map((x) => x.exclusionReason)).toEqual(['DUPLICATE_NAME', 'DUPLICATE_NAME']);
    expect(r.totalEligible).toBe(0);
  });

  it('"Juan Pérez" y "Juan Pérez Rebolledo" pueden participar ambos', () => {
    const r = evaluateParticipants([p('Juan Pérez'), p('Juan Pérez Rebolledo')]);
    expect(r.totalEligible).toBe(2);
  });

  it('"Juan Pérez" y "juan pérez" pueden participar ambos (case-sensible)', () => {
    const r = evaluateParticipants([p('Juan Pérez'), p('juan pérez')]);
    expect(r.totalEligible).toBe(2);
  });

  it('"Juan Perez" sin tilde y "Juan Pérez" con tilde son distintos', () => {
    const r = evaluateParticipants([p('Juan Perez'), p('Juan Pérez')]);
    expect(r.totalEligible).toBe(2);
  });

  it('los espacios de mas no crean falsos distintos', () => {
    const r = evaluateParticipants([p('Juan  Pérez'), p(' Juan Pérez ')]);
    expect(r.totalEligible).toBe(0);
    expect(normalizeExact('Juan  Pérez')).toBe('Juan Pérez');
  });
});

describe('seccion 19 - edicion manual', () => {
  it('el operador puede incluir a alguien excluido por nombre incompleto', () => {
    const r = evaluateParticipants([p('Juan', { externalId: 'u1' })], { manualOverrides: { u1: true } });
    expect(r.participants[0].autoEligible).toBe(false);
    expect(r.participants[0].autoExclusionReason).toBe('INCOMPLETE_NAME');
    expect(r.participants[0].eligible).toBe(true);
  });

  it('el operador puede excluir a alguien elegible y queda con motivo MANUAL', () => {
    const r = evaluateParticipants([p('Juan Pérez', { externalId: 'u1' })], { manualOverrides: { u1: false } });
    expect(r.participants[0].eligible).toBe(false);
    expect(r.participants[0].exclusionReason).toBe('MANUAL');
  });
});

describe('seccion 24 - ganadores anteriores', () => {
  it('un ganador anterior de la misma reunion queda excluido', () => {
    const r = evaluateParticipants([p('Juan Pérez'), p('María González')], {
      previousWinnerNames: ['Juan Pérez'],
    });
    expect(r.participants[0].exclusionReason).toBe('PREVIOUS_WINNER');
    expect(r.participants[1].eligible).toBe(true);
  });
});

describe('prioridad de reglas', () => {
  it('HOST gana sobre ADIPA y sobre nombre incompleto', () => {
    const r = evaluateParticipants([p('Adipa', { email: 'host@x.com' })], { hostEmail: 'host@x.com' });
    expect(r.participants[0].exclusionReason).toBe('HOST');
  });

  it('ADIPA gana sobre duplicado', () => {
    const r = evaluateParticipants([p('Equipo ADIPA'), p('Equipo ADIPA')]);
    expect(r.participants.every((x) => x.exclusionReason === 'ADIPA_NAME')).toBe(true);
  });

  it('duplicado gana sobre nombre incompleto', () => {
    const r = evaluateParticipants([p('Juan'), p('Juan')]);
    expect(r.participants.every((x) => x.exclusionReason === 'DUPLICATE_NAME')).toBe(true);
  });
});

describe('resumen y trazabilidad', () => {
  it('los totales cuadran y hay motivo para cada excluido (seccion 18)', () => {
    const r = evaluateParticipants([
      p('Juan Pérez'),
      p('María González'),
      p('iPhone'),
      p('Nicole'),
      p('Equipo ADIPA'),
      p('Pedro Soto'),
      p('Pedro Soto'),
    ]);

    expect(r.totalFound).toBe(7);
    expect(r.totalEligible).toBe(2);
    expect(r.totalExcluded).toBe(5);
    expect(r.byReason.DEVICE_NAME).toBe(1);
    expect(r.byReason.INCOMPLETE_NAME).toBe(1);
    expect(r.byReason.ADIPA_NAME).toBe(1);
    expect(r.byReason.DUPLICATE_NAME).toBe(2);

    for (const participant of r.participants) {
      if (!participant.eligible) expect(participant.exclusionReason).not.toBeNull();
      expect(participant.trace.length).toBeGreaterThan(0);
    }
  });
});

describe('seccion 22 - volumen', () => {
  // Los tokens con digitos no cuentan como nombre de persona ("Galaxy S24"),
  // asi que los nombres de prueba se generan solo con letras.
  const alphaSuffix = (n: number) =>
    n === 0 ? 'a' : n.toString(26).split('').map((c) => 'abcdefghijklmnopqrstuvwxyz'[parseInt(c, 26)]).join('');

  it('evalua 1.000 participantes de forma determinista', () => {
    const many = Array.from({ length: 1000 }, (_, i) => p(`Nombre${alphaSuffix(i)} Apellido${alphaSuffix(i)}`));
    const a = evaluateParticipants(many);
    const b = evaluateParticipants(many);
    expect(a.totalEligible).toBe(1000);
    expect(a.participants.map((x) => x.eligible)).toEqual(b.participants.map((x) => x.eligible));
  });
});
