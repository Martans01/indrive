import { useState, useEffect, useRef } from "react";
import { Car, Fuel, Plus, Play, Square, Settings as Cog, Trash2, X, Calculator, Wallet, Home, Clock, Check } from "lucide-react";

const STORAGE_KEY = "indrive_ganancia_v2";
const DEFAULTS = {
  settings: { commissionPct: 12.99, gasFactor: 10 / 150 },
  jornadas: [],
  looseRefuels: [],
};

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const perKm = (n) => `$${(Number(n) || 0).toFixed(3)}`;
const uid = () => Math.random().toString(36).slice(2, 9);
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

function useCountUp(target, duration = 700) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = target;
    if (from === to) { setVal(to); return; }
    let start, raf;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function calcJornada(j, settings) {
  const bruto = (j.rides || []).reduce((s, r) => s + r.amount, 0);
  const comision = bruto * (settings.commissionPct / 100);
  const otros = (j.expenses || []).reduce((s, e) => s + e.amount, 0);
  let consumed = 0, gas = 0;
  if (j.startRange != null && j.endRange != null) {
    const refuel = (j.refuels || []).reduce((s, rf) => s + Math.max(0, rf.after - rf.before), 0);
    consumed = Math.max(0, (j.startRange - j.endRange) + refuel);
    gas = consumed * settings.gasFactor;
  }
  return { bruto, comision, otros, consumed, gas, neto: bruto - comision - gas - otros };
}

function calcPersonal(data) {
  const closed = data.jornadas
    .filter((j) => j.status === "closed" && j.startRange != null && j.endRange != null)
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  let totalKm = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const prev = closed[i], next = closed[i + 1];
    const between = (data.looseRefuels || [])
      .filter((rf) => new Date(rf.at) > new Date(prev.endAt) && new Date(rf.at) < new Date(next.startAt))
      .reduce((s, rf) => s + Math.max(0, rf.after - rf.before), 0);
    const personal = prev.endRange + between - next.startRange;
    if (personal > 0) totalKm += personal;
  }
  return { km: totalKm, gas: totalKm * data.settings.gasFactor };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(DEFAULTS);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState("inicio");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) setData({ ...DEFAULTS, ...JSON.parse(res.value) });
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const save = async (next) => {
    setData(next);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
  };

  const active = data.jornadas.find((j) => j.status === "active");

  const startJornada = (range) => { save({ ...data, jornadas: [...data.jornadas, { id: uid(), startAt: new Date().toISOString(), endAt: null, startRange: range, endRange: null, status: "active", rides: [], refuels: [], expenses: [] }] }); setModal(null); };
  const endJornada = (range) => { save({ ...data, jornadas: data.jornadas.map((j) => j.id === active.id ? { ...j, endRange: range, endAt: new Date().toISOString(), status: "closed" } : j) }); setModal(null); };
  const addRide = (amount) => { save({ ...data, jornadas: data.jornadas.map((j) => j.id === active.id ? { ...j, rides: [...j.rides, { id: uid(), amount, at: new Date().toISOString() }] } : j) }); setModal(null); };
  const addExpense = (amount, desc) => { save({ ...data, jornadas: data.jornadas.map((j) => j.id === active.id ? { ...j, expenses: [...j.expenses, { id: uid(), amount, desc, at: new Date().toISOString() }] } : j) }); setModal(null); };
  const addRefuel = (before, after, cost) => {
    const rf = { id: uid(), before, after, cost, at: new Date().toISOString() };
    const rangeAdded = Math.max(0, after - before);
    let nextSettings = data.settings;
    if (cost != null && cost > 0 && rangeAdded > 0) {
      const newF = cost / rangeAdded;
      const blended = data.settings.gasFactor > 0 ? data.settings.gasFactor * 0.5 + newF * 0.5 : newF;
      nextSettings = { ...data.settings, gasFactor: blended };
      showToast(`Factor ajustado a ${perKm(blended)}/km`);
    }
    if (active) save({ ...data, settings: nextSettings, jornadas: data.jornadas.map((j) => j.id === active.id ? { ...j, refuels: [...(j.refuels || []), rf] } : j) });
    else save({ ...data, settings: nextSettings, looseRefuels: [...(data.looseRefuels || []), rf] });
    setModal(null);
  };
  const saveSettings = (commissionPct, gasFactor) => { save({ ...data, settings: { commissionPct, gasFactor } }); setModal(null); };
  const deleteJornada = (id) => save({ ...data, jornadas: data.jornadas.filter((j) => j.id !== id) });

  const today = dayKey(new Date());
  const closed = data.jornadas.filter((j) => j.status === "closed");
  const sumNeto = (arr) => arr.reduce((s, j) => s + calcJornada(j, data.settings).neto, 0);
  const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return closed.filter((j) => new Date(j.startAt) >= d); };
  const netoHoy = sumNeto(closed.filter((j) => dayKey(j.startAt) === today));
  const netoSemana = sumNeto(inDays(7));
  const netoMes = sumNeto(inDays(30));
  const personal = calcPersonal(data);
  const carrerasHoy = closed.filter((j) => dayKey(j.startAt) === today).reduce((s, j) => s + j.rides.length, 0) + (active ? active.rides.length : 0);
  const animHoy = useCountUp(netoHoy);

  if (loading) return <div className="min-h-screen bg-zinc-900 flex items-center justify-center text-zinc-500 text-sm">Cargando…</div>;

  const ac = active ? calcJornada(active, data.settings) : null;
  const acNetoProv = ac ? ac.bruto - ac.comision - ac.otros : 0;

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 pb-24" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
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
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full w-8 h-8 flex items-center justify-center shadow-lg shadow-violet-900/30"><Car size={17} className="text-white" /></div>
            <span className="font-semibold tracking-tight text-[15px]">inDrive</span>
          </div>
          <button onClick={() => setModal({ type: "settings" })} className="text-zinc-500 hover:text-zinc-200 transition-colors"><Cog size={19} /></button>
        </header>

        {tab === "inicio" && (
          <div key="inicio">
            <div className="py-6 mb-2 a-fade">
              <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-2">Neto de hoy</p>
              <p className={`text-6xl font-light tracking-tighter tabular-nums ${netoHoy < 0 ? "text-rose-400" : "text-violet-300"}`}>{money(animHoy)}</p>
              <p className="text-zinc-500 text-sm mt-2">{carrerasHoy} {carrerasHoy === 1 ? "carrera" : "carreras"}</p>
            </div>

            <div className="flex rounded-2xl bg-zinc-800/50 border border-zinc-700/50 divide-x divide-zinc-700/50 mb-7 a-fade" style={{ animationDelay: ".06s" }}>
              <div className="flex-1 py-4 px-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Semana</p>
                <p className="text-xl font-light text-zinc-100 tabular-nums">{money(netoSemana)}</p>
              </div>
              <div className="flex-1 py-4 px-5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Mes</p>
                <p className="text-xl font-light text-zinc-100 tabular-nums">{money(netoMes)}</p>
              </div>
            </div>

            {active ? (
              <div className="rounded-3xl border border-violet-500/30 bg-violet-500/[0.07] p-5 mb-6 a-fade" style={{ animationDelay: ".12s" }}>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-medium text-violet-300 flex items-center gap-1.5 tracking-wide"><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" /> EN JORNADA</span>
                  <span className="text-[11px] text-zinc-400">Rango inicio · {active.startRange} km</span>
                </div>
                <div className="mb-5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-1">Llevas (sin gas)</p>
                  <p className="text-3xl font-light text-violet-300 tabular-nums">{money(acNetoProv)}</p>
                  <p className="text-[11px] text-zinc-500 mt-1">{active.rides.length} carreras · la gasolina se calcula al terminar</p>
                </div>
                <button onClick={() => setModal({ type: "ride" })} className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] transition-all duration-200 text-white font-semibold rounded-2xl py-4 mb-2.5 flex items-center justify-center gap-2 shadow-lg shadow-violet-900/30"><Plus size={20} /> Carrera</button>
                <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                  <SoftBtn onClick={() => setModal({ type: "refuel" })} icon={<Fuel size={16} />}>Recarga</SoftBtn>
                  <SoftBtn onClick={() => setModal({ type: "expense" })} icon={<Wallet size={16} />}>Otro gasto</SoftBtn>
                </div>
                <button onClick={() => setModal({ type: "endJornada" })} className="w-full bg-zinc-700/80 hover:bg-zinc-700 active:scale-[0.98] transition-all duration-200 text-zinc-100 font-medium rounded-2xl py-3.5 flex items-center justify-center gap-2"><Square size={16} /> Terminar jornada</button>
              </div>
            ) : (
              <button onClick={() => setModal({ type: "startJornada" })} className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] transition-all duration-200 text-white font-semibold rounded-2xl py-5 mb-6 flex items-center justify-center gap-2 text-[17px] shadow-lg shadow-violet-900/30 a-fade" style={{ animationDelay: ".12s" }}><Play size={20} /> Iniciar jornada</button>
            )}

            {!active && closed.length === 0 && (
              <p className="text-center text-zinc-500 text-sm leading-relaxed px-6 a-fade" style={{ animationDelay: ".18s" }}>Toca <span className="text-violet-300">Iniciar jornada</span> y anota el rango de gasolina que marca tu carro.</p>
            )}
          </div>
        )}

        {tab === "historial" && (
          <div className="pt-1" key="historial">
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 mb-4 a-fade">Historial</h2>

            {personal.gas > 0 && (
              <div className="rounded-2xl border border-zinc-700/50 bg-zinc-800/50 p-4 mb-5 flex items-center justify-between a-fade">
                <div className="flex items-center gap-3">
                  <Fuel size={18} className="text-amber-400" />
                  <div>
                    <p className="text-sm">Gasolina personal</p>
                    <p className="text-[11px] text-zinc-500">{Math.round(personal.km)} km fuera de jornada</p>
                  </div>
                </div>
                <p className="text-lg font-light text-amber-400 tabular-nums">{money(personal.gas)}</p>
              </div>
            )}

            {closed.length === 0 ? (
              <p className="text-center text-zinc-500 text-sm py-10 a-fade">Aún no hay jornadas registradas.</p>
            ) : (
              <div className="space-y-2.5">
                {closed.slice().reverse().map((j, i) => {
                  const c = calcJornada(j, data.settings);
                  return (
                    <div key={j.id} className="rounded-2xl border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800 transition-colors p-4 a-fade" style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}>
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-sm text-zinc-300">{new Date(j.startAt).toLocaleDateString("es-PA", { weekday: "short", day: "2-digit", month: "short" })}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-light tabular-nums ${c.neto < 0 ? "text-rose-400" : "text-violet-300"}`}>{money(c.neto)}</span>
                          <button onClick={() => deleteJornada(j.id)} className="text-zinc-500 hover:text-rose-400 transition-colors"><Trash2 size={15} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-[12px]">
                        <Row label={`${j.rides.length} carreras`} value={money(c.bruto)} />
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
          <NavBtn active={tab === "inicio"} onClick={() => setTab("inicio")} icon={<Home size={20} />}>Inicio</NavBtn>
          <NavBtn active={tab === "historial"} onClick={() => setTab("historial")} icon={<Clock size={20} />}>Historial</NavBtn>
        </div>
      </nav>

      {toast && (
        <div className="fixed top-5 inset-x-0 flex justify-center z-[60] px-5">
          <div className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-medium rounded-full px-4 py-2 flex items-center gap-2 shadow-xl shadow-violet-900/40 a-toast"><Check size={15} /> {toast}</div>
        </div>
      )}

      {modal && <Modal modal={modal} data={data} onClose={() => setModal(null)} onStart={startJornada} onEnd={endJornada} onRide={addRide} onExpense={addExpense} onRefuel={addRefuel} onSettings={saveSettings} active={active} />}
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-zinc-500">{label}</span>
      <span className={`tabular-nums ${muted ? "text-zinc-400" : "text-zinc-200"}`}>{value}</span>
    </div>
  );
}

function SoftBtn({ children, onClick, icon }) {
  return (
    <button onClick={onClick} className="rounded-2xl py-3 flex items-center justify-center gap-2 text-[13px] bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-all duration-200 active:scale-[0.97]">
      {icon}{children}
    </button>
  );
}

function NavBtn({ children, onClick, icon, active }) {
  return (
    <button onClick={onClick} className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] tracking-wide transition-colors ${active ? "text-violet-300" : "text-zinc-500"}`}>
      {icon}{children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, step = "0.01", hint }) {
  return (
    <div className="mb-3.5">
      <label className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1.5 block">{label}</label>
      <input type="number" inputMode="decimal" step={step} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-light focus:outline-none focus:border-violet-500/60 transition-colors placeholder:text-zinc-600" />
      {hint && <p className="text-[11px] text-zinc-500 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function Modal({ modal, data, onClose, onStart, onEnd, onRide, onExpense, onRefuel, onSettings, active }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState("");
  const [d, setD] = useState("");
  const [comm, setComm] = useState(String(data.settings.commissionPct));
  const [calMoney, setCalMoney] = useState("");
  const [calKm, setCalKm] = useState("");
  const [factor, setFactor] = useState(String(data.settings.gasFactor.toFixed(4)));

  const titles = { startJornada: "Iniciar jornada", endJornada: "Terminar jornada", ride: "Nueva carrera", expense: "Otro gasto", refuel: "Registrar recarga", settings: "Configuración" };
  const f = parseFloat(factor) || data.settings.gasFactor;

  const endPreview = (() => {
    if (modal.type !== "endJornada" || !active || a === "") return null;
    const refuel = (active.refuels || []).reduce((s, rf) => s + Math.max(0, rf.after - rf.before), 0);
    const consumed = Math.max(0, active.startRange - parseFloat(a) + refuel);
    return { consumed, gas: consumed * data.settings.gasFactor };
  })();

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-800 border-t sm:border border-zinc-700 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md a-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-lg tracking-tight">{titles[modal.type]}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 transition-colors"><X size={22} /></button>
        </div>

        {modal.type === "startJornada" && (<>
          <Field label="Rango de gasolina (km)" value={a} onChange={setA} placeholder="200" step="1" hint="El número de autonomía que marca tu tablero ahora." />
          <Btn disabled={a === ""} onClick={() => onStart(parseFloat(a))}>Iniciar</Btn>
        </>)}

        {modal.type === "endJornada" && (<>
          <Field label="Rango de gasolina ahora (km)" value={a} onChange={setA} placeholder="50" step="1" hint="Lo que marca el tablero al terminar." />
          {endPreview && <div className="rounded-xl bg-zinc-900 p-3.5 mb-4 a-pop"><p className="text-[11px] uppercase tracking-wide text-zinc-500">Gasolina de la jornada</p><p className="font-light text-amber-400 text-lg tabular-nums">{Math.round(endPreview.consumed)} km · {money(endPreview.gas)}</p></div>}
          <Btn disabled={a === ""} onClick={() => onEnd(parseFloat(a))}>Terminar y guardar</Btn>
        </>)}

        {modal.type === "ride" && (<>
          <Field label="Monto de la carrera ($)" value={a} onChange={setA} placeholder="5.00" hint={`Se descuenta la comisión de ${data.settings.commissionPct}% automáticamente.`} />
          <Btn disabled={a === ""} onClick={() => onRide(parseFloat(a))}>Agregar</Btn>
        </>)}

        {modal.type === "expense" && (<>
          <Field label="Monto ($)" value={a} onChange={setA} placeholder="3.00" />
          <Field label="Descripción (opcional)" value={d} onChange={setD} placeholder="comida, peaje…" step="any" />
          <Btn disabled={a === ""} onClick={() => onExpense(parseFloat(a), d)}>Agregar</Btn>
        </>)}

        {modal.type === "refuel" && (<>
          <p className="text-[12px] text-zinc-400 mb-4 leading-snug">{active ? "Recarga durante la jornada activa." : "Recarga fuera de jornada (uso personal)."} Con el costo, el factor de gasolina se ajusta solo.</p>
          <Field label="Rango antes de tanquear (km)" value={a} onChange={setA} placeholder="40" step="1" />
          <Field label="Rango después de tanquear (km)" value={b} onChange={setB} placeholder="350" step="1" />
          <Field label="Costo ($) — ajusta el factor" value={c} onChange={setC} placeholder="20" hint={a !== "" && b !== "" && c !== "" && parseFloat(b) > parseFloat(a) ? `Nuevo factor de referencia: ${perKm(parseFloat(c) / (parseFloat(b) - parseFloat(a)))}/km` : "Recomendado para que el cálculo se mantenga real."} />
          <Btn disabled={a === "" || b === ""} onClick={() => onRefuel(parseFloat(a), parseFloat(b), c === "" ? null : parseFloat(c))}>Guardar recarga</Btn>
        </>)}

        {modal.type === "settings" && (<>
          <Field label="Comisión inDrive (%)" value={comm} onChange={setComm} placeholder="12.99" />
          <Field label="Factor de gasolina ($/km de rango)" value={factor} onChange={setFactor} step="0.0001" hint={`Actual: ${perKm(f)} por km · se autoajusta con cada recarga.`} />
          <div className="rounded-2xl bg-zinc-900 p-4 mb-4">
            <p className="text-[11px] uppercase tracking-wide text-violet-300 mb-3 flex items-center gap-1.5"><Calculator size={14} /> Calibrar manual</p>
            <Field label="Dinero tanqueado ($)" value={calMoney} onChange={setCalMoney} placeholder="10" />
            <Field label="Cuánto subió el rango (km)" value={calKm} onChange={setCalKm} placeholder="150" step="1" />
            {calMoney !== "" && calKm !== "" && parseFloat(calKm) > 0 && <p className="text-[12px] text-violet-300 mb-2.5 tabular-nums">= {perKm(parseFloat(calMoney) / parseFloat(calKm))} por km</p>}
            <button disabled={calMoney === "" || calKm === "" || parseFloat(calKm) <= 0} onClick={() => setFactor(String((parseFloat(calMoney) / parseFloat(calKm)).toFixed(4)))} className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 rounded-xl py-2.5 text-sm transition-colors">Usar este factor</button>
          </div>
          <Btn disabled={false} onClick={() => onSettings(parseFloat(comm) || 0, parseFloat(factor) || DEFAULTS.settings.gasFactor)}>Guardar</Btn>
        </>)}
      </div>
    </div>
  );
}

function Btn({ children, onClick, disabled }) {
  return (
    <button disabled={disabled} onClick={onClick} className="w-full bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100 text-white font-semibold rounded-2xl py-3.5 mt-1 transition-all duration-200 shadow-lg shadow-violet-900/30">
      {children}
    </button>
  );
}
