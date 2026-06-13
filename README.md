# inDrive · Ganancia

App móvil para que un conductor de inDrive registre jornadas y calcule su
ganancia neta (bruto − comisión − gasolina − otros gastos). Datos en
**Convex** (sincronizados en la nube, en tiempo real).

Stack: **Vite + React 19 + TypeScript + Tailwind v4 + Convex**.

## Puesta en marcha

Requisitos: Node ≥ 18.

```bash
npm install
```

### 1. Conectar Convex (una sola vez)

```bash
npx convex dev
```

La primera vez:

1. Abre el navegador para que inicies sesión en Convex.
2. Elige **"link to an existing project"** y selecciona el deployment
   `industrious-curlew-131`.
3. Escribe `CONVEX_DEPLOYMENT` en `.env.local`, genera `convex/_generated/`
   y **empuja el schema y las funciones** a tu deployment.

Deja este proceso corriendo: vigila los archivos de `convex/` y vuelve a
desplegar en cada cambio.

### 2. Arrancar el frontend (en otra terminal)

```bash
npm run dev
```

Abre la URL que imprime Vite (por defecto http://localhost:5173).

## Scripts

| Script            | Qué hace                                            |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Servidor de desarrollo de Vite (frontend).          |
| `npm run convex`  | `convex dev`: deploy + watch del backend.           |
| `npm run build`   | Typecheck (`tsc -b`) + build de producción.         |
| `npm run preview` | Sirve el build de producción localmente.            |

## Estructura

```
convex/
  schema.ts        Tablas: settings, jornadas (con rides/refuels/expenses
                   embebidos + snapshot), looseRefuels.
  queries.ts       getState — estado completo para el cliente.
  mutations.ts     start/end jornada, addRide, addExpense, addRefuel,
                   saveSettings, deleteJornada.
  model.ts         Helpers de dominio (factor de gasolina, snapshot).
src/
  App.tsx          UI (lee getState con useQuery, escribe con useMutation).
  lib/calc.ts      Cálculos puros: calcJornada, calcPersonal, helpers.
  types.ts         Tipos derivados del schema de Convex.
  main.tsx         Monta React + ConvexProvider.
```

## Notas de diseño

- **Histórico congelado.** Al cerrar una jornada se guarda un `snapshot`
  (bruto, comisión, gas, neto y los parámetros usados). El historial lee ese
  snapshot, así que cambiar luego la comisión o el factor de gasolina **no
  reescribe** las jornadas pasadas.
- **Fechas en hora local.** "Neto de hoy" agrupa por día local (no UTC), para
  no clasificar mal las jornadas nocturnas.
- `VITE_CONVEX_URL` (en `.env.local`) es la URL pública del deployment que
  consume el navegador. `CONVEX_DEPLOYMENT` lo gestiona el CLI.
