import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Red de seguridad diaria: reemite a FinanzApp los netos de jornadas cerradas
// que quedaron sin sincronizar (p.ej. si el push falló por red al cerrarlas).
crons.daily(
  "reconciliar ingresos inDrive hacia FinanzApp",
  { hourUTC: 7, minuteUTC: 0 },
  internal.sync.reconcilePending
);

export default crons;
