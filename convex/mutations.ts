import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  blendGasFactor,
  computeSnapshot,
  getSettingsValues,
  setSettings,
  uid,
} from "./model";

export const startJornada = mutation({
  args: { startRange: v.number() },
  handler: async (ctx, { startRange }) => {
    await ctx.db.insert("jornadas", {
      startAt: new Date().toISOString(),
      endAt: null,
      startRange,
      endRange: null,
      status: "active",
      rides: [],
      refuels: [],
      expenses: [],
    });
  },
});

export const endJornada = mutation({
  args: { id: v.id("jornadas"), endRange: v.number() },
  handler: async (ctx, { id, endRange }) => {
    const j = await ctx.db.get(id);
    if (!j) throw new Error("Jornada no encontrada");
    const settings = await getSettingsValues(ctx);
    // Congelamos el cálculo con la comisión y el factor vigentes AHORA.
    const snapshot = computeSnapshot({ ...j, endRange }, settings);
    await ctx.db.patch(id, {
      endRange,
      endAt: new Date().toISOString(),
      status: "closed",
      snapshot,
    });
  },
});

export const addRide = mutation({
  args: { id: v.id("jornadas"), amount: v.number(), tip: v.optional(v.number()) },
  handler: async (ctx, { id, amount, tip }) => {
    const j = await ctx.db.get(id);
    if (!j) throw new Error("Jornada no encontrada");
    await ctx.db.patch(id, {
      rides: [...j.rides, { id: uid(), amount, tip, at: new Date().toISOString() }],
    });
  },
});

export const addExpense = mutation({
  args: { id: v.id("jornadas"), amount: v.number(), desc: v.optional(v.string()) },
  handler: async (ctx, { id, amount, desc }) => {
    const j = await ctx.db.get(id);
    if (!j) throw new Error("Jornada no encontrada");
    await ctx.db.patch(id, {
      expenses: [
        ...j.expenses,
        { id: uid(), amount, desc, at: new Date().toISOString() },
      ],
    });
  },
});

export const addRefuel = mutation({
  args: {
    jornadaId: v.union(v.id("jornadas"), v.null()),
    before: v.number(),
    after: v.number(),
    cost: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { jornadaId, before, after, cost }) => {
    const settings = await getSettingsValues(ctx);
    const rangeAdded = Math.max(0, after - before);
    let gasFactor = settings.gasFactor;
    let adjusted = false;
    if (cost != null && cost > 0 && rangeAdded > 0) {
      gasFactor = blendGasFactor(settings.gasFactor, cost / rangeAdded);
      adjusted = true;
      await setSettings(ctx, { commissionPct: settings.commissionPct, gasFactor });
    }

    const rf = { id: uid(), before, after, cost, at: new Date().toISOString() };
    if (jornadaId) {
      const j = await ctx.db.get(jornadaId);
      if (!j) throw new Error("Jornada no encontrada");
      await ctx.db.patch(jornadaId, { refuels: [...j.refuels, rf] });
    } else {
      await ctx.db.insert("looseRefuels", rf);
    }
    return { adjusted, gasFactor };
  },
});

export const setCurrentRange = mutation({
  args: { id: v.id("jornadas"), currentRange: v.number() },
  handler: async (ctx, { id, currentRange }) => {
    const j = await ctx.db.get(id);
    if (!j) throw new Error("Jornada no encontrada");
    await ctx.db.patch(id, { currentRange });
  },
});

export const saveSettings = mutation({
  args: { commissionPct: v.number(), gasFactor: v.number() },
  handler: async (ctx, args) => {
    await setSettings(ctx, args);
  },
});

export const deleteJornada = mutation({
  args: { id: v.id("jornadas") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
