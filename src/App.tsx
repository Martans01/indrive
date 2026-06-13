import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Car,
  Fuel,
  Plus,
  Play,
  Square,
  Settings as Cog,
  Trash2,
  X,
  Calculator,
  Wallet,
  Home,
  Clock,
  Check,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { AppState, Jornada, JornadaId, Settings } from "./types";
import { calcJornada, calcPersonal, dayKey, money, perKm, sumRefuelRange } from "./lib/calc";

const DEFAULT_SETTINGS: Settings = { commissionPct: 12.99, gasFactor: 10 / 150 };
const EMPTY_STATE: AppState = { settings: DEFAULT_SETTINGS, jornadas: [], looseRefuels: [] };

type ModalType =
  | "startJornada"
  | "endJornada"
  | "ride"
  | "expense"
  | "refuel"
  | "currentRange"
  | "settings"
  | "confirmDelete";

type ModalState =
  | { type: Exclude<ModalType, "confirmDelete"> }
  | { type: "confirmDelete"; jornadaId: JornadaId; label: string }
  | null;

function useCountUp(target: number, duration = 700) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  const display = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) {
      setVal(to);
      return;
    }
    let start: number | undefined;
    let raf = 0;
    const tick = (t: number) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const current = from + (to - from) * eased;
      display.current = current;
      setVal(current);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    // Si el target cambia a mitad de animación, arrancamos desde el valor
    // mostrado en ese instante (evita el salto a 0).
    return () => {
      cancelAnimationFrame(raf);
      prev.current = display.current;
    };
  }, [target, duration]);
  return val;
}

export default function App() {
  const data = useQuery(api.queries.getState);
  const [modal, setModal] = useState<ModalState>(null);
  const [tab, setTab] = useState<"inicio" | "historial">("inicio");
  const [toast, setToast] = useState<string | null>(null);

  const mStart = useMutation(api.mutations.startJornada);
  const mEnd = useMutation(api.mutations.endJornada);
  const mRide = useMutation(api.mutations.addRide);
  const mExpense = useMutation(api.mutations.addExpense);
  const mRefuel = useMutation(api.mutations.addRefuel);
  const mSettings = useMutation(api.mutations.saveSettings);
  const mDelete = useMutation(api.mutations.deleteJornada);
  const mSetCurrent = useMutation(api.mutations.setCurrentRange);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const state = data ?? EMPTY_STATE;
  const { settings, jornadas, looseRefuels } = state;
  const active = jornadas.find((j) => j.status === "active");

  const startJornada = async (range: number) => {
    await mStart({ startRange: range });
    setModal(null);
  };
  const endJornada = async (range: number) => {
    if (!active) return;
    await mEnd({ id: active._id, endRange: range });
    setModal(null);
  };
  const addRide = async (amount: number, tip: number) => {
    if (!active) return;
    await mRide({ id: active._id, amount, tip: tip > 0 ? tip : undefined });
    setModal(null);
  };
  const addExpense = async (amount: number, desc: string) => {
    if (!active) return;
    await mExpense({ id: active._id, amount, desc: desc.trim() || undefined });
    setModal(null);
  };
  const addRefuel = async (before: number, after: number, cost: number | null) => {
    const res = await mRefuel({ jornadaId: active ? active._id : null, before, after, cost });
    if (res?.adjusted) showToast(`Factor ajustado a ${perKm(res.gasFactor)}/km`);
    setModal(null);
  };
  const saveSettings = async (commissionPct: number, gasFactor: number) => {
    await mSettings({ commissionPct, gasFactor });
    setModal(null);
  };
  const setCurrentRange = async (range: number) => {
    if (!active) return;
    await mSetCurrent({ id: active._id, currentRange: range });
    setModal(null);
  };
  const deleteJornada = async (id: JornadaId) => {
    await mDelete({ id });
    setModal(null);
  };

  const today = dayKey(new Date());
  const closed = jornadas.filter((j) => j.status === "closed");
  const sumNeto = (arr: Jornada[]) =>
    arr.reduce((s, j) => s + calcJornada(j, settings).neto, 0);
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0); // normaliza al inicio del día local
    return closed.filter((j) => new Date(j.startAt) >= d);
  };
  const netoHoy = sumNeto(closed.filter((j) => dayKey(j.startAt) === today));
  const netoSemana = sumNeto(inDays(7));
  const netoMes = sumNeto(inDays(30));
  const personal = calcPersonal(state);
  const carrerasHoy =
    closed
      .filter((j) => dayKey(j.startAt) === today)
      .reduce((s, j) => s + j.rides.length, 0) + (active ? active.rides.length : 0);
  const animHoy = useCountUp(netoHoy);

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center text-zinc-400 text-sm">
        Cargando…
      </div>
    );
  }

  const ac = active ? calcJornada(active, settings) : null;
  const acNetoProv = ac ? ac.bruto - ac.comision - ac.otros : 0;

  return (
    <div
      className="min-h-screen bg-zinc-900 text-zinc-100 pb-24"
      style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}
    >
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px);} to {opacity:1; transform:none;} }
        @keyframes sheetUp { from { transform:translateY(100%);} to { transform:translateY(0);} }
        @keyframes pop { from { opacity:0; transform:scale(.95);} to {opacity:1; transform:scale(1);} }
        @keyframes toastIn { from {opacity:0; transform:translateY(-14px);} to {opacity:1; transform:none;} }
        .a-fade { animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
        .a-sheet { animation: sheetUp .35s cubic-bezier(.22,1,.36,1) both; }
        .a-pop { animation: pop .25s ease-out both; }
        .a-toast { animation: toastIn .3s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      <div className="max-w-md mx-auto px-5">
        <header className="flex items-center justify-between pt-7 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full w-8 h-8 flex items-center justify-center shadow-lg shadow-violet-900/30">
              <Car size={17} className="text-white" />
            </div>
            <span className="font-semibold tracking-tight text-[15px]">inDrive</span>
          </div>
          <button
            onClick={() => setModal({ type: "settings" })}
            aria-label="Configuración"
            className="text-zinc-400 hover:text-zinc-100 transition-colors p-2 -m-2"
          >
            <Cog size={19} />
          </button>
        </header>

        {tab === "inicio" && (
          <div key="inicio">
            <div className="py-6 mb-2 a-fade">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 mb-2">Neto de hoy</p>
              <p
                className={`text-6xl font-light tracking-tighter tabular-nums ${
                  netoHoy < 0 ? "text-rose-400" : "text-violet-300"
                }`}
              >
                {money(animHoy)}
              </p>
              <p className="text-zinc-400 text-sm mt-2">
                {carrerasHoy} {carrerasHoy === 1 ? "carrera" : "carreras"}
              </p>
            </div>

            <div
              className="flex rounded-2xl bg-zinc-800/50 border border-zinc-700/50 divide-x divide-zinc-700/50 mb-7 a-fade"
              style={{ animationDelay: ".06s" }}
            >
              <div className="flex-1 py-4 px-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Últimos 7 días</p>
                <p className="text-xl font-light text-zinc-100 tabular-nums">{money(netoSemana)}</p>
              </div>
              <div className="flex-1 py-4 px-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Últimos 30 días</p>
                <p className="text-xl font-light text-zinc-100 tabular-nums">{money(netoMes)}</p>
              </div>
            </div>

            {active ? (
              <div
                className="rounded-3xl border border-violet-500/30 bg-violet-500/[0.07] p-5 mb-6 a-fade"
                style={{ animationDelay: ".12s" }}
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-medium text-violet-300 flex items-center gap-1.5 tracking-wide">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> EN JORNADA
                  </span>
                  <span className="text-[11px] text-zinc-400">Rango inicio · {active.startRange} km</span>
                </div>
                <div className="mb-5">
                  {active.currentRange != null && ac ? (
                    <>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1">
                        Neto ahora (con gas)
                      </p>
                      <p
                        className={`text-3xl font-light tabular-nums ${
                          ac.neto < 0 ? "text-rose-400" : "text-violet-300"
                        }`}
                      >
                        {money(ac.neto)}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {active.rides.length} carreras · gas {Math.round(ac.consumed)} km −{money(ac.gas)} · sin gas{" "}
                        {money(acNetoProv)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1">Llevas (sin gas)</p>
                      <p className="text-3xl font-light text-violet-300 tabular-nums">{money(acNetoProv)}</p>
                      <p className="text-[11px] text-zinc-400 mt-1">
                        {active.rides.length} carreras · toca “Gasolina ahora” para verla en vivo
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setModal({ type: "ride" })}
                  className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] transition-all duration-200 text-white font-semibold rounded-2xl py-4 mb-2.5 flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30"
                >
                  <Plus size={20} /> Carrera
                </button>
                <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                  <SoftBtn onClick={() => setModal({ type: "refuel" })} icon={<Fuel size={16} />}>
                    Recarga
                  </SoftBtn>
                  <SoftBtn onClick={() => setModal({ type: "expense" })} icon={<Wallet size={16} />}>
                    Otro gasto
                  </SoftBtn>
                </div>
                <div className="mb-2.5">
                  <SoftBtn onClick={() => setModal({ type: "currentRange" })} icon={<Gauge size={16} />}>
                    {active.currentRange != null
                      ? `Gasolina ahora · marca ${active.currentRange} km`
                      : "Gasolina ahora"}
                  </SoftBtn>
                </div>
                <button
                  onClick={() => setModal({ type: "endJornada" })}
                  className="w-full bg-zinc-700/80 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-200 text-zinc-100 font-medium rounded-2xl py-3.5 flex items-center justify-center gap-2"
                >
                  <Square size={16} /> Terminar jornada
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModal({ type: "startJornada" })}
                className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] transition-all duration-200 text-white font-semibold rounded-2xl py-5 mb-6 flex items-center justify-center gap-2 text-[17px] shadow-lg shadow-violet-900/30 a-fade"
                style={{ animationDelay: ".12s" }}
              >
                <Play size={20} /> Iniciar jornada
              </button>
            )}

            {!active && closed.length === 0 && (
              <p
                className="text-center text-zinc-400 text-sm leading-relaxed px-6 a-fade"
                style={{ animationDelay: ".18s" }}
              >
                Toca <span className="text-violet-300">Iniciar jornada</span> y anota el rango de
                gasolina que marca tu carro.
              </p>
            )}
          </div>
        )}

        {tab === "historial" && (
          <div className="pt-1" key="historial">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 mb-4 a-fade">Historial</h2>

            {personal.gas > 0 && (
              <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/50 p-4 mb-5 flex items-center justify-between a-fade">
                <div className="flex items-center gap-3">
                  <Fuel size={18} className="text-amber-400" />
                  <div>
                    <p className="text-sm">Gasolina personal</p>
                    <p className="text-[11px] text-zinc-400">{Math.round(personal.km)} km fuera de jornada</p>
                  </div>
                </div>
                <p className="text-lg font-light text-amber-400 tabular-nums">{money(personal.gas)}</p>
              </div>
            )}

            {closed.length === 0 ? (
              <p className="text-center text-zinc-400 text-sm py-10 a-fade">Aún no hay jornadas registradas.</p>
            ) : (
              <div className="space-y-2.5">
                {closed
                  .slice()
                  .reverse()
                  .map((j, i) => {
                    const c = calcJornada(j, settings);
                    const fecha = new Date(j.startAt).toLocaleDateString("es-PA", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                    });
                    return (
                      <div
                        key={j._id}
                        className="rounded-2xl border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 transition-colors p-4 a-fade"
                        style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-sm text-zinc-300">{fecha}</span>
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-lg font-light tabular-nums ${
                                c.neto < 0 ? "text-rose-400" : "text-violet-300"
                              }`}
                            >
                              {money(c.neto)}
                            </span>
                            <button
                              onClick={() =>
                                setModal({
                                  type: "confirmDelete",
                                  jornadaId: j._id,
                                  label: `${fecha} · ${money(c.neto)}`,
                                })
                              }
                              aria-label={`Borrar jornada del ${fecha}`}
                              className="text-zinc-500 hover:text-rose-400 transition-colors p-2 -m-2"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1 text-[12px]">
                          <Row label={`${j.rides.length} carreras`} value={money(c.bruto - c.propinas)} />
                          {c.propinas > 0 && <Row label="Propinas" value={`+${money(c.propinas)}`} />}
                          <Row label="Comisión" value={`−${money(c.comision)}`} muted />
                          <Row label={`Gas · ${Math.round(c.consumed)} km`} value={`−${money(c.gas)}`} muted />
                          {c.otros > 0 && <Row label="Otros" value={`−${money(c.otros)}`} muted />}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-xl">
        <div className="max-w-md mx-auto flex">
          <NavBtn active={tab === "inicio"} onClick={() => setTab("inicio")} icon={<Home size={20} />}>
            Inicio
          </NavBtn>
          <NavBtn active={tab === "historial"} onClick={() => setTab("historial")} icon={<Clock size={20} />}>
            Historial
          </NavBtn>
        </div>
      </nav>

      <div
        role="status"
        aria-live="polite"
        className="fixed top-5 inset-x-0 flex justify-center z-[60] px-5 pointer-events-none"
      >
        {toast && (
          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium rounded-full px-4 py-2 flex items-center gap-2 shadow-xl shadow-violet-900/40 a-toast">
            <Check size={15} /> {toast}
          </div>
        )}
      </div>

      {modal && (
        <Modal
          key={modal.type}
          modal={modal}
          settings={settings}
          active={active}
          onClose={() => setModal(null)}
          onStart={startJornada}
          onEnd={endJornada}
          onRide={addRide}
          onExpense={addExpense}
          onRefuel={addRefuel}
          onSettings={saveSettings}
          onDelete={deleteJornada}
          onSetCurrent={setCurrentRange}
        />
      )}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className={`tabular-nums ${muted ? "text-zinc-400" : "text-zinc-200"}`}>{value}</span>
    </div>
  );
}

function SoftBtn({
  children,
  onClick,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl py-3 flex items-center justify-center gap-2 text-[13px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-all duration-200 active:scale-[0.97]"
    >
      {icon}
      {children}
    </button>
  );
}

function NavBtn({
  children,
  onClick,
  icon,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] tracking-wide transition-colors ${
        active ? "text-violet-300" : "text-zinc-400"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
  hint?: string;
  error?: string;
  type?: "number" | "text";
  inputMode?: "decimal" | "numeric" | "text";
  min?: number;
  autoFocus?: boolean;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  step = "0.01",
  hint,
  error,
  type = "number",
  inputMode = "decimal",
  min,
  autoFocus,
}: FieldProps) {
  return (
    <div className="mb-3.5">
      <label className="text-[11px] uppercase tracking-wide text-zinc-300 mb-1.5 block">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        step={type === "number" ? step : undefined}
        min={type === "number" ? min : undefined}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-zinc-900 border rounded-xl px-4 py-3 text-lg font-light focus:outline-none transition-colors placeholder:text-zinc-500 ${
          error ? "border-rose-500/70 focus:border-rose-500" : "border-zinc-700 focus:border-violet-500/60"
        }`}
      />
      {error ? (
        <p className="text-[11px] text-rose-400 mt-1.5 leading-snug">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-zinc-400 mt-1.5 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

type ModalProps = {
  modal: NonNullable<ModalState>;
  settings: Settings;
  active?: Jornada;
  onClose: () => void;
  onStart: (range: number) => void;
  onEnd: (range: number) => void;
  onRide: (amount: number, tip: number) => void;
  onExpense: (amount: number, desc: string) => void;
  onRefuel: (before: number, after: number, cost: number | null) => void;
  onSettings: (commissionPct: number, gasFactor: number) => void;
  onDelete: (id: JornadaId) => void;
  onSetCurrent: (range: number) => void;
};

const TITLES: Record<ModalType, string> = {
  startJornada: "Iniciar jornada",
  endJornada: "Terminar jornada",
  ride: "Nueva carrera",
  expense: "Otro gasto",
  refuel: "Registrar recarga",
  currentRange: "Gasolina hasta ahora",
  settings: "Configuración",
  confirmDelete: "Borrar jornada",
};

function Modal({
  modal,
  settings,
  active,
  onClose,
  onStart,
  onEnd,
  onRide,
  onExpense,
  onRefuel,
  onSettings,
  onDelete,
  onSetCurrent,
}: ModalProps) {
  const [a, setA] = useState(
    modal.type === "currentRange" && active?.currentRange != null
      ? String(active.currentRange)
      : ""
  );
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [desc, setDesc] = useState("");
  const [comm, setComm] = useState(String(settings.commissionPct));
  const [calMoney, setCalMoney] = useState("");
  const [calKm, setCalKm] = useState("");
  const [factor, setFactor] = useState(settings.gasFactor.toFixed(4));

  const panelRef = useRef<HTMLDivElement>(null);

  // a11y: cerrar con ESC y mover el foco al diálogo al abrir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (s: string) => parseFloat(s);
  const f = num(factor) || settings.gasFactor;

  // Vista previa de consumo/gas para los modales que usan una lectura de
  // autonomía: terminar jornada y "gasolina ahora".
  const usesRange = modal.type === "endJornada" || modal.type === "currentRange";
  const consumoPreview = (() => {
    if (!usesRange || !active || a === "") return null;
    const consumed = Math.max(0, (active.startRange ?? 0) - num(a) + sumRefuelRange(active.refuels));
    return { consumed, gas: consumed * settings.gasFactor };
  })();

  const refuelError =
    modal.type === "refuel" && a !== "" && b !== "" && num(b) <= num(a)
      ? "El rango después de tanquear debe ser mayor que el de antes."
      : undefined;

  // Solo avisamos si la autonomía indicada supera lo explicable: rango inicial +
  // recargas YA registradas. Si recargaste y lo anotaste, marcar más que al
  // inicio es normal y no dispara la alerta.
  const expectedMax = active ? (active.startRange ?? 0) + sumRefuelRange(active.refuels) : 0;
  const rangeWarning =
    usesRange && active && a !== "" && num(a) > expectedMax
      ? "La autonomía indicada supera al rango inicial más las recargas registradas. ¿Faltó registrar una recarga?"
      : undefined;

  const titleId = "modal-title";

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-zinc-800 border-t sm:border border-zinc-700 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md a-sheet focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id={titleId} className="font-semibold text-lg tracking-tight">
            {TITLES[modal.type]}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-zinc-300 hover:text-zinc-100 transition-colors p-2 -m-2"
          >
            <X size={22} />
          </button>
        </div>

        {modal.type === "startJornada" && (
          <>
            <Field
              label="Rango de gasolina (km)"
              value={a}
              onChange={setA}
              placeholder="200"
              step="1"
              inputMode="numeric"
              min={0}
              autoFocus
              hint="El número de autonomía que marca tu tablero ahora."
            />
            <Btn disabled={a === "" || num(a) < 0} onClick={() => onStart(num(a))}>
              Iniciar
            </Btn>
          </>
        )}

        {modal.type === "endJornada" && (
          <>
            <Field
              label="Rango de gasolina ahora (km)"
              value={a}
              onChange={setA}
              placeholder="50"
              step="1"
              inputMode="numeric"
              min={0}
              autoFocus
              hint="Lo que marca el tablero al terminar."
              error={rangeWarning}
            />
            {consumoPreview && (
              <div className="rounded-xl bg-zinc-900 p-3.5 mb-4 a-pop">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">Gasolina de la jornada</p>
                <p className="font-light text-amber-400 text-lg tabular-nums">
                  {Math.round(consumoPreview.consumed)} km · {money(consumoPreview.gas)}
                </p>
              </div>
            )}
            <Btn disabled={a === "" || num(a) < 0} onClick={() => onEnd(num(a))}>
              Terminar y guardar
            </Btn>
          </>
        )}

        {modal.type === "currentRange" && (
          <>
            <Field
              label="¿Cuánto marca el tablero ahora? (km)"
              value={a}
              onChange={setA}
              placeholder="170"
              step="1"
              inputMode="numeric"
              min={0}
              autoFocus
              hint="La autonomía actual. La jornada sigue abierta; esto solo estima la gasolina gastada hasta ahora."
              error={rangeWarning}
            />
            {consumoPreview && (
              <div className="rounded-xl bg-zinc-900 p-3.5 mb-4 a-pop">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">Gasolina hasta ahora</p>
                <p className="font-light text-amber-400 text-lg tabular-nums">
                  {Math.round(consumoPreview.consumed)} km · {money(consumoPreview.gas)}
                </p>
              </div>
            )}
            <Btn disabled={a === "" || num(a) < 0} onClick={() => onSetCurrent(num(a))}>
              Guardar lectura
            </Btn>
          </>
        )}

        {modal.type === "ride" && (
          <>
            <Field
              label="Tarifa de la carrera ($)"
              value={a}
              onChange={setA}
              placeholder="4.50"
              min={0}
              autoFocus
              hint={`Lo que marca la app. Se le descuenta la comisión de ${settings.commissionPct}%.`}
            />
            <Field
              label="Propina / extra sin comisión ($)"
              value={b}
              onChange={setB}
              placeholder="0.50"
              min={0}
              hint="Lo que te dieron de más (no paga comisión). Déjalo vacío si no hubo."
            />
            <Btn
              disabled={a === "" || !(num(a) > 0)}
              onClick={() => onRide(num(a), b === "" ? 0 : num(b) || 0)}
            >
              Agregar
            </Btn>
          </>
        )}

        {modal.type === "expense" && (
          <>
            <Field label="Monto ($)" value={a} onChange={setA} placeholder="3.00" min={0} autoFocus />
            <Field
              label="Descripción (opcional)"
              value={desc}
              onChange={setDesc}
              placeholder="comida, peaje…"
              type="text"
              inputMode="text"
            />
            <Btn disabled={a === "" || !(num(a) > 0)} onClick={() => onExpense(num(a), desc)}>
              Agregar
            </Btn>
          </>
        )}

        {modal.type === "refuel" && (
          <>
            <p className="text-[12px] text-zinc-300 mb-4 leading-snug">
              {active
                ? "Recarga durante la jornada activa."
                : "Recarga fuera de jornada (uso personal)."}{" "}
              Con el costo, el factor de gasolina se ajusta solo.
            </p>
            <Field
              label="Rango antes de tanquear (km)"
              value={a}
              onChange={setA}
              placeholder="40"
              step="1"
              inputMode="numeric"
              min={0}
              autoFocus
            />
            <Field
              label="Rango después de tanquear (km)"
              value={b}
              onChange={setB}
              placeholder="350"
              step="1"
              inputMode="numeric"
              min={0}
              error={refuelError}
            />
            <Field
              label="Costo ($) — ajusta el factor"
              value={c}
              onChange={setC}
              placeholder="20"
              min={0}
              hint={
                a !== "" && b !== "" && c !== "" && num(b) > num(a)
                  ? `Nuevo factor de referencia: ${perKm(num(c) / (num(b) - num(a)))}/km`
                  : "Recomendado para que el cálculo se mantenga real."
              }
            />
            <Btn
              disabled={a === "" || b === "" || num(b) <= num(a)}
              onClick={() => onRefuel(num(a), num(b), c === "" ? null : num(c))}
            >
              Guardar recarga
            </Btn>
          </>
        )}

        {modal.type === "settings" && (
          <>
            <Field
              label="Comisión inDrive (%)"
              value={comm}
              onChange={setComm}
              placeholder="12.99"
              step="any"
              min={0}
              hint="Puedes poner los decimales exactos (ej. 12.999999 o 13)."
              error={
                comm !== "" && (num(comm) < 0 || num(comm) > 100)
                  ? "La comisión debe estar entre 0 y 100."
                  : undefined
              }
            />
            <Field
              label="Factor de gasolina ($/km de rango)"
              value={factor}
              onChange={setFactor}
              step="0.0001"
              min={0}
              hint={`Actual: ${perKm(f)} por km · se autoajusta con cada recarga.`}
            />
            <div className="rounded-2xl bg-zinc-900 p-4 mb-4">
              <p className="text-[11px] uppercase tracking-wide text-violet-300 mb-3 flex items-center gap-1.5">
                <Calculator size={14} /> Calibrar manual
              </p>
              <Field label="Dinero tanqueado ($)" value={calMoney} onChange={setCalMoney} placeholder="10" min={0} />
              <Field
                label="Cuánto subió el rango (km)"
                value={calKm}
                onChange={setCalKm}
                placeholder="150"
                step="1"
                inputMode="numeric"
                min={0}
              />
              {calMoney !== "" && calKm !== "" && num(calKm) > 0 && (
                <p className="text-[12px] text-violet-300 mb-2.5 tabular-nums">
                  = {perKm(num(calMoney) / num(calKm))} por km
                </p>
              )}
              <button
                disabled={calMoney === "" || calKm === "" || !(num(calKm) > 0)}
                onClick={() => setFactor((num(calMoney) / num(calKm)).toFixed(4))}
                className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 rounded-xl py-2.5 text-sm transition-colors"
              >
                Usar este factor
              </button>
            </div>
            <Btn
              disabled={comm !== "" && (num(comm) < 0 || num(comm) > 100)}
              onClick={() => onSettings(num(comm) || 0, num(factor) || DEFAULT_SETTINGS.gasFactor)}
            >
              Guardar
            </Btn>
          </>
        )}

        {modal.type === "confirmDelete" && (
          <>
            <div className="flex items-start gap-3 mb-5">
              <AlertTriangle size={20} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-sm text-zinc-300 leading-relaxed">
                Vas a borrar la jornada <span className="text-zinc-100">{modal.label}</span> con todas
                sus carreras, gastos y recargas. Esta acción no se puede deshacer.
              </p>
            </div>
            <button
              onClick={() => onDelete(modal.jornadaId)}
              className="w-full bg-rose-600 hover:bg-rose-500 active:scale-[0.98] transition-all duration-200 text-white font-semibold rounded-2xl py-3.5 mb-2.5"
            >
              Borrar definitivamente
            </button>
            <button
              onClick={onClose}
              className="w-full bg-zinc-700 hover:bg-zinc-600 active:scale-[0.98] transition-all duration-200 text-zinc-100 font-medium rounded-2xl py-3"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 text-white font-semibold rounded-2xl py-3.5 mt-1 transition-all duration-200 shadow-lg shadow-violet-900/30"
    >
      {children}
    </button>
  );
}
