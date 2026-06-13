import type { Doc, Id } from "../convex/_generated/dataModel";

export type Settings = { commissionPct: number; gasFactor: number };

export type Jornada = Doc<"jornadas">;
export type LooseRefuel = Doc<"looseRefuels">;

export type Ride = Jornada["rides"][number];
export type Refuel = Jornada["refuels"][number];
export type Expense = Jornada["expenses"][number];
export type Snapshot = NonNullable<Jornada["snapshot"]>;

export type JornadaId = Id<"jornadas">;

export type AppState = {
  settings: Settings;
  jornadas: Jornada[];
  looseRefuels: LooseRefuel[];
};
