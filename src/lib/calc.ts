import type { AppState, Jornada, Settings } from "../types";

export const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
export const perKm = (n: number) => `$${(Number(n) || 0).toFixed(3)}`;

// Clave de día en hora LOCAL (no UTC). 'en-CA' produce formato YYYY-MM-DD.
// Corrige el bug del conductor nocturno: una jornada a las 20:00 en Panamá
// ya no salta al día siguiente por el desfase UTC-5.
export const dayKey = (d: string | number | Date) =>
  new Date(d).toLocaleDateString("en-CA");

export const refuelRange = (rf: { before: number; after: number }) =>
  Math.max(0, (Number(rf.after) || 0) - (Number(rf.before) || 0));

export const sumRefuelRange = (
  refuels: { before: number; after: number }[] = []
) => refuels.reduce((s, rf) => s + refuelRange(rf), 0);

export type JornadaCalc = {
  bruto: number;
  comision: number;
  otros: number;
  consumed: number;
  gas: number;
  neto: number;
};

export function calcJornada(j: Jornada, settings: Settings): JornadaCalc {
  // Jornadas cerradas: leer el snapshot congelado al cerrar (histórico estable).
  if (j.status === "closed" && j.snapshot) {
    const { bruto, comision, otros, consumed, gas, neto } = j.snapshot;
    return { bruto, comision, otros, consumed, gas, neto };
  }

  // Jornada activa (o cerrada sin snapshot): cálculo en vivo.
  const bruto = (j.rides ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const comision = bruto * (settings.commissionPct / 100);
  const otros = (j.expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  let consumed = 0;
  let gas = 0;
  if (j.startRange != null && j.endRange != null) {
    consumed = Math.max(0, j.startRange - j.endRange + sumRefuelRange(j.refuels));
    gas = consumed * settings.gasFactor;
  }

  return { bruto, comision, otros, consumed, gas, neto: bruto - comision - gas - otros };
}

// Gasolina personal estimada: km recorridos ENTRE jornadas (uso no laboral),
// imputados con el factor de gasolina actual. Es una estimación derivada.
export function calcPersonal(data: AppState) {
  const closed = data.jornadas
    .filter((j) => j.status === "closed" && j.startRange != null && j.endRange != null)
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));

  let totalKm = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const prev = closed[i];
    const next = closed[i + 1];
    const between = (data.looseRefuels ?? [])
      .filter(
        (rf) =>
          new Date(rf.at) > new Date(prev.endAt as string) &&
          new Date(rf.at) < new Date(next.startAt)
      )
      .reduce((s, rf) => s + refuelRange(rf), 0);
    const personal = (prev.endRange as number) + between - (next.startRange as number);
    if (personal > 0) totalKm += personal;
  }
  return { km: totalKm, gas: totalKm * data.settings.gasFactor };
}
