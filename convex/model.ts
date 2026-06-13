import type { MutationCtx, QueryCtx } from "./_generated/server";

// --- Constantes de negocio (antes literales mágicos dispersos) ---
export const DEFAULT_SETTINGS = { commissionPct: 12.99, gasFactor: 10 / 150 };
export const BLEND_WEIGHT = 0.5;

export const uid = () => Math.random().toString(36).slice(2, 9);

// --- Helpers de consumo / factor (única fuente de verdad en el servidor) ---
export const refuelRange = (rf: { before: number; after: number }) =>
  Math.max(0, rf.after - rf.before);

export const sumRefuelRange = (refuels: { before: number; after: number }[]) =>
  refuels.reduce((s, rf) => s + refuelRange(rf), 0);

export function blendGasFactor(prev: number, next: number) {
  return prev > 0 ? prev * BLEND_WEIGHT + next * (1 - BLEND_WEIGHT) : next;
}

// --- Settings (un único documento) ---
export async function getSettingsDoc(ctx: QueryCtx) {
  return await ctx.db.query("settings").first();
}

export async function getSettingsValues(ctx: QueryCtx) {
  const doc = await getSettingsDoc(ctx);
  return doc
    ? { commissionPct: doc.commissionPct, gasFactor: doc.gasFactor }
    : { ...DEFAULT_SETTINGS };
}

export async function setSettings(
  ctx: MutationCtx,
  values: { commissionPct: number; gasFactor: number }
) {
  const doc = await getSettingsDoc(ctx);
  if (doc) await ctx.db.patch(doc._id, values);
  else await ctx.db.insert("settings", values);
}

// --- Snapshot que se congela al cerrar la jornada ---
type SnapshotInput = {
  rides: { amount: number; tip?: number }[];
  expenses: { amount: number }[];
  refuels: { before: number; after: number }[];
  startRange: number | null;
  endRange: number | null;
};

export function computeSnapshot(
  j: SnapshotInput,
  settings: { commissionPct: number; gasFactor: number }
) {
  const fares = j.rides.reduce((s, r) => s + r.amount, 0); // sujeto a comisión
  const propinas = j.rides.reduce((s, r) => s + (r.tip ?? 0), 0); // extra sin comisión
  const bruto = fares + propinas; // total recibido
  const comision = fares * (settings.commissionPct / 100);
  const otros = j.expenses.reduce((s, e) => s + e.amount, 0);
  let consumed = 0;
  if (j.startRange != null && j.endRange != null) {
    consumed = Math.max(0, j.startRange - j.endRange + sumRefuelRange(j.refuels));
  }
  const gas = consumed * settings.gasFactor;
  return {
    bruto,
    propinas,
    comision,
    otros,
    consumed,
    gas,
    neto: bruto - comision - gas - otros,
    gasFactorUsed: settings.gasFactor,
    commissionPctUsed: settings.commissionPct,
  };
}
