import { v } from "convex/values";
import {
  internalAction,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Sincronización del neto de cada jornada hacia FinanzApp.
 *
 * Al cerrar una jornada (mutations.endJornada) se agenda `emitToFinanzApp`,
 * que hace un POST autenticado al webhook `/indrive-income` de FinanzApp. El
 * `crons.ts` corre `reconcilePending` a diario como red de seguridad: reemite
 * las jornadas que quedaron sin sincronizar (p.ej. si FinanzApp estaba caído).
 * La idempotencia real vive en FinanzApp (campo `external_id`), así que reemitir
 * es seguro.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Panamá es UTC-5 fijo (sin horario de verano). Agrupamos por día LOCAL para no
// clasificar mal las jornadas nocturnas (mismo criterio que el cliente).
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;
const dayKeyLocal = (iso: string) =>
  new Date(new Date(iso).getTime() - PANAMA_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

export const getJornadaForSync = internalQuery({
  args: { jornadaId: v.id("jornadas") },
  handler: async (ctx, { jornadaId }) => {
    return await ctx.db.get(jornadaId);
  },
});

export const markSynced = internalMutation({
  args: { jornadaId: v.id("jornadas") },
  handler: async (ctx, { jornadaId }) => {
    await ctx.db.patch(jornadaId, { syncedToFinanzApp: true });
  },
});

export const listPendingSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const closed = await ctx.db
      .query("jornadas")
      .withIndex("by_status", (q) => q.eq("status", "closed"))
      .collect();
    return closed
      .filter(
        (j) => !j.syncedToFinanzApp && j.snapshot && j.snapshot.neto > 0
      )
      .map((j) => j._id);
  },
});

export const emitToFinanzApp = internalAction({
  args: { jornadaId: v.id("jornadas") },
  handler: async (ctx, { jornadaId }) => {
    const j = await ctx.runQuery(internal.sync.getJornadaForSync, { jornadaId });
    if (!j || !j.snapshot) return { skipped: "sin snapshot" };
    if (j.syncedToFinanzApp) return { skipped: "ya sincronizada" };

    const neto = round2(j.snapshot.neto);
    if (neto <= 0) return { skipped: "neto<=0" };

    const url = process.env.FINANZAPP_SITE_URL;
    const secret = process.env.INDRIVE_WEBHOOK_SECRET;
    if (!url || !secret) {
      throw new Error(
        "FINANZAPP_SITE_URL / INDRIVE_WEBHOOK_SECRET no configurados"
      );
    }

    const res = await fetch(`${url}/indrive-income`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": secret,
      },
      body: JSON.stringify({
        externalId: `indrive:${jornadaId}`,
        amount: neto,
        date: dayKeyLocal(j.endAt ?? new Date().toISOString()),
        description: "Ganancia inDrive",
      }),
    });

    if (!res.ok) {
      // No marcar como sincronizada: el cron de reconciliación reintentará.
      throw new Error(`FinanzApp respondió ${res.status}`);
    }

    await ctx.runMutation(internal.sync.markSynced, { jornadaId });
    return { synced: true, neto };
  },
});

// Revierte en FinanzApp el ingreso de una jornada (al borrarla). Best-effort:
// si FinanzApp está caído, el ingreso queda como fantasma (sin reintento).
export const reverseInFinanzApp = internalAction({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    const url = process.env.FINANZAPP_SITE_URL;
    const secret = process.env.INDRIVE_WEBHOOK_SECRET;
    if (!url || !secret) {
      throw new Error(
        "FINANZAPP_SITE_URL / INDRIVE_WEBHOOK_SECRET no configurados"
      );
    }
    const res = await fetch(`${url}/indrive-income-reverse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-token": secret,
      },
      body: JSON.stringify({ externalId }),
    });
    if (!res.ok) throw new Error(`FinanzApp (reverse) respondió ${res.status}`);
    return { reversed: true };
  },
});

// Red de seguridad: reemite las jornadas cerradas que no se sincronizaron.
export const reconcilePending = internalAction({
  args: {},
  handler: async (ctx) => {
    const ids = await ctx.runQuery(internal.sync.listPendingSync, {});
    let synced = 0;
    for (const jornadaId of ids) {
      try {
        await ctx.runAction(internal.sync.emitToFinanzApp, { jornadaId });
        synced++;
      } catch (e) {
        console.error("reconcile: falló jornada", jornadaId, e);
      }
    }
    return { pending: ids.length, synced };
  },
});
