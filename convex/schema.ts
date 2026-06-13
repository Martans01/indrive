import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const ride = v.object({
  id: v.string(),
  amount: v.number(),
  at: v.string(),
});

const refuel = v.object({
  id: v.string(),
  before: v.number(),
  after: v.number(),
  cost: v.union(v.number(), v.null()),
  at: v.string(),
});

const expense = v.object({
  id: v.string(),
  amount: v.number(),
  desc: v.optional(v.string()),
  at: v.string(),
});

// Cálculo congelado al CERRAR la jornada. Hace que el histórico sea estable
// y auditable: cambiar la comisión o el factor de gasolina después ya no
// reescribe retroactivamente las jornadas pasadas.
const snapshot = v.object({
  bruto: v.number(),
  comision: v.number(),
  otros: v.number(),
  consumed: v.number(),
  gas: v.number(),
  neto: v.number(),
  gasFactorUsed: v.number(),
  commissionPctUsed: v.number(),
});

export default defineSchema({
  settings: defineTable({
    commissionPct: v.number(),
    gasFactor: v.number(),
  }),

  jornadas: defineTable({
    startAt: v.string(),
    endAt: v.union(v.string(), v.null()),
    startRange: v.union(v.number(), v.null()),
    endRange: v.union(v.number(), v.null()),
    status: v.union(v.literal("active"), v.literal("closed")),
    rides: v.array(ride),
    refuels: v.array(refuel),
    expenses: v.array(expense),
    snapshot: v.optional(snapshot),
  }).index("by_status", ["status"]),

  looseRefuels: defineTable({
    before: v.number(),
    after: v.number(),
    cost: v.union(v.number(), v.null()),
    at: v.string(),
  }),
});
