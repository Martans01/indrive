import { query } from "./_generated/server";
import { getSettingsValues } from "./model";

// Estado completo de la app. Para un único conductor el volumen es pequeño,
// así que devolvemos todo y los cálculos derivados se hacen en el cliente
// (jornada activa) o se leen del snapshot (jornadas cerradas).
export const getState = query({
  args: {},
  handler: async (ctx) => {
    const settings = await getSettingsValues(ctx);
    const jornadas = await ctx.db.query("jornadas").collect();
    const looseRefuels = await ctx.db.query("looseRefuels").collect();
    return { settings, jornadas, looseRefuels };
  },
});
