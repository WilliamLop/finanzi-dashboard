import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "./supabase"
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts"

const CATEGORIES = ["Vivienda/Arriendo", "Alimentación", "Transporte", "Salud", "Entretenimiento"]
const CAT_ICONS  = ["🏠", "🍽️", "🚌", "💊", "🎬"]
const COLORS     = ["#6366F1", "#F59E0B", "#10B981", "#EF4444", "#06B6D4"]
const MONTHS     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const COP        = v => "$ " + Number(v || 0).toLocaleString("es-CO")

const CAT_FIELD = {
  "Vivienda/Arriendo": "cat_vivienda",
  "Alimentación":      "cat_alimentacion",
  "Transporte":        "cat_transporte",
  "Salud":             "cat_salud",
  "Entretenimiento":   "cat_entretenimiento",
}

const DEFAULT_BUDGET = {
  total_budget: 0, saving_goal: 0,
  cat_vivienda: 0, cat_alimentacion: 0,
  cat_transporte: 0, cat_salud: 0, cat_entretenimiento: 0
}

const TABS = [
  { id: "resumen",      icon: "⬡",  label: "Resumen"      },
  { id: "gastos",       icon: "↓",  label: "Gastos"       },
  { id: "ingresos",     icon: "↑",  label: "Ingresos"     },
  { id: "fuentes",      icon: "◎",  label: "Fuentes"      },
  { id: "deudas",       icon: "◈",  label: "Deudas"       },
  { id: "presupuesto",  icon: "◉",  label: "Presupuesto"  },
  { id: "historial",    icon: "▦",  label: "Historial"    },
]

export default function App() {
  const now = new Date()
  const [tab, setTab]     = useState("resumen")
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear]   = useState(now.getFullYear())

  const [expenses, setExpenses] = useState([])
  const [incomes, setIncomes]   = useState([])
  const [sources, setSources]   = useState([])
  const [debts, setDebts]       = useState([])
  const [budget, setBudget]     = useState(DEFAULT_BUDGET)
  const [histData, setHistData] = useState([])
  const [loading, setLoading]   = useState(true)

  const [form, setForm]         = useState({ description: "", category: CATEGORIES[0], amount: "" })
  const [incForm, setIncForm]   = useState({ source_id: "", amount: "", quincena: "1" })
  const [srcForm, setSrcForm]   = useState({ name: "", day_q1: "1", day_q2: "16", expected: "" })
  const [debtForm, setDebtForm] = useState({ name: "", total: "", installments: "", paid: "0", due_date: "", monthly_payment: "" })

  const [toast, setToast] = useState(null)
  const toastRef = useRef()

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3500)
  }

  const loadExpenses = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("*")
      .eq("month", month).eq("year", year).order("created_at", { ascending: false })
    setExpenses(data || [])
  }, [month, year])

  const loadIncomes = useCallback(async () => {
    const { data } = await supabase.from("incomes").select("*, sources(name)")
      .eq("month", month).eq("year", year).order("created_at", { ascending: false })
    setIncomes(data || [])
  }, [month, year])

  const loadSources = async () => {
    const { data } = await supabase.from("sources").select("*").order("name")
    setSources(data || [])
  }

  const loadDebts = async () => {
    const { data } = await supabase.from("debts").select("*").order("name")
    setDebts(data || [])
  }

  const loadBudget = useCallback(async () => {
    const { data } = await supabase.from("budgets").select("*")
      .eq("month", month).eq("year", year).maybeSingle()
    setBudget(data || DEFAULT_BUDGET)
  }, [month, year])

  const loadHistorial = useCallback(async () => {
    const hist = []
    for (let i = 5; i >= 0; i--) {
      let m = month - i, y = year
      if (m < 0) { m += 12; y -= 1 }
      const [expRes, incRes] = await Promise.all([
        supabase.from("expenses").select("amount").eq("month", m).eq("year", y),
        supabase.from("incomes").select("amount").eq("month", m).eq("year", y),
      ])
      hist.push({
        name:      MONTHS[m].slice(0, 3),
        ingresos:  (incRes.data || []).reduce((s, x) => s + Number(x.amount), 0),
        gastos:    (expRes.data || []).reduce((s, x) => s + Number(x.amount), 0),
      })
    }
    setHistData(hist)
  }, [month, year])

  useEffect(() => { loadSources(); loadDebts() }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadExpenses(), loadIncomes(), loadBudget(), loadHistorial()])
      .finally(() => setLoading(false))
  }, [month, year])

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addExpense = async () => {
    const amt = parseFloat(form.amount)
    if (!form.description.trim() || isNaN(amt) || amt <= 0) return showToast("Completa todos los campos.", "err")
    const { error } = await supabase.from("expenses").insert({
      description: form.description.trim(), category: form.category, amount: amt, month, year
    })
    if (error) return showToast("Error al guardar.", "err")
    setForm(f => ({ ...f, description: "", amount: "" }))
    showToast("Gasto registrado ✓")
    loadExpenses()
  }

  const deleteExpense = async (id) => { await supabase.from("expenses").delete().eq("id", id); loadExpenses() }

  const addIncome = async () => {
    const amt = parseFloat(incForm.amount)
    if (!incForm.source_id || isNaN(amt) || amt <= 0) return showToast("Selecciona fuente e ingresa monto.", "err")
    const { error } = await supabase.from("incomes").insert({
      source_id: parseInt(incForm.source_id), amount: amt, quincena: parseInt(incForm.quincena), month, year
    })
    if (error) return showToast("Error al guardar.", "err")
    setIncForm(f => ({ ...f, amount: "" }))
    showToast("Ingreso registrado ✓")
    loadIncomes()
  }

  const deleteIncome = async (id) => { await supabase.from("incomes").delete().eq("id", id); loadIncomes() }

  const addSource = async () => {
    if (!srcForm.name.trim()) return showToast("Escribe el nombre de la fuente.", "err")
    const { error } = await supabase.from("sources").insert({
      name: srcForm.name.trim(), day_q1: parseInt(srcForm.day_q1) || 1,
      day_q2: parseInt(srcForm.day_q2) || 16, expected: parseFloat(srcForm.expected) || 0,
    })
    if (error) return showToast("Error al guardar.", "err")
    setSrcForm({ name: "", day_q1: "1", day_q2: "16", expected: "" })
    showToast("Fuente agregada ✓")
    loadSources()
  }

  const deleteSource = async (id) => { await supabase.from("sources").delete().eq("id", id); loadSources() }

  const addDebt = async () => {
    if (!debtForm.name.trim() || !debtForm.total || !debtForm.installments)
      return showToast("Completa nombre, monto total y cuotas.", "err")
    const { error } = await supabase.from("debts").insert({
      name: debtForm.name.trim(), total: parseFloat(debtForm.total),
      installments: parseInt(debtForm.installments), paid: parseInt(debtForm.paid) || 0,
      due_date: debtForm.due_date || null,
      monthly_payment: parseFloat(debtForm.monthly_payment) || 0,
    })
    if (error) return showToast("Error al guardar.", "err")
    setDebtForm({ name: "", total: "", installments: "", paid: "0", due_date: "", monthly_payment: "" })
    showToast("Deuda registrada ✓")
    loadDebts()
  }

  const deleteDebt = async (id) => { await supabase.from("debts").delete().eq("id", id); loadDebts() }

  const updateDebtPaid = async (id, val) => {
    await supabase.from("debts").update({ paid: parseInt(val) }).eq("id", id)
    loadDebts()
  }

  const updateBudget = async (key, val) => {
    const updated = { ...budget, [key]: parseFloat(val) || 0 }
    setBudget(updated)
    const payload = { ...updated, month, year }
    if (budget.id) {
      await supabase.from("budgets").update(payload).eq("id", budget.id)
    } else {
      const { data } = await supabase.from("budgets").insert(payload).select().single()
      if (data) setBudget(data)
    }
  }

  const exportCSV = () => {
    const rows = [["Tipo","Descripción/Fuente","Categoría/Quincena","Monto COP"]]
    expenses.forEach(e => rows.push(["Gasto", e.description, e.category, e.amount]))
    incomes.forEach(i => rows.push(["Ingreso", i.sources?.name || "—", `Q${i.quincena}`, i.amount]))
    rows.push([], ["Total Ingresos","","",totalIncome],["Total Gastos","","",totalSpent],["Balance","","",balance])
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `finanzas_${MONTHS[month]}_${year}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const totByCat = CATEGORIES.reduce((a, c) => {
    a[c] = expenses.filter(e => e.category === c).reduce((s, e) => s + Number(e.amount), 0); return a
  }, {})

  const totalSpent      = Object.values(totByCat).reduce((a, b) => a + b, 0)
  const q1Inc           = incomes.filter(i => i.quincena === 1).reduce((s, i) => s + Number(i.amount), 0)
  const q2Inc           = incomes.filter(i => i.quincena === 2).reduce((s, i) => s + Number(i.amount), 0)
  const totalIncome     = q1Inc + q2Inc
  const balance         = totalIncome - totalSpent
  const savingGoal      = budget.saving_goal || 0
  const totalBudget     = budget.total_budget || 0
  const actualSaving    = Math.max(balance, 0)
  const savingPct       = savingGoal > 0 ? Math.min((actualSaving / savingGoal) * 100, 100) : 0
  const getInstAmt = (d) => d.monthly_payment > 0 ? d.monthly_payment : (d.installments > 0 ? Math.round(d.total / d.installments) : 0)
  const totalDebtMonth  = debts.reduce((s, d) => s + getInstAmt(d), 0)
  const budgetByCat     = Object.fromEntries(CATEGORIES.map(c => [c, budget[CAT_FIELD[c]] || 0]))
  const pct  = (s, b) => b > 0 ? Math.min((s / b) * 100, 100) : 0
  const over = (s, b) => b > 0 && s > b
  const pieData = CATEGORIES.filter(c => totByCat[c] > 0).map((c, i) => ({
    name: c, value: totByCat[c], color: COLORS[CATEGORIES.indexOf(c)]
  }))
  const payAlerts = sources.filter(s => s.day_q1 === now.getDate() || s.day_q2 === now.getDate())

  // ── Styles ─────────────────────────────────────────────────────────────────

  const S = {
    layout:   { display: "flex", minHeight: "100vh", background: "#07090F" },
    sidebar:  { width: 220, background: "#0D1117", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", padding: "24px 12px", position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 10 },
    main:     { marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" },
    topbar:   { background: "rgba(13,17,23,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 9 },
    content:  { padding: 28, flex: 1 },
    card:     { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 },
    inp:      { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", color: "#F1F5F9", fontSize: 14, outline: "none", fontFamily: "inherit" },
    btnPrim:  { background: "linear-gradient(135deg,#6366F1,#8B5CF6)", border: "none", borderRadius: 10, color: "#fff", fontWeight: 600, fontSize: 14, padding: "11px 0", cursor: "pointer", width: "100%", fontFamily: "inherit" },
    label:    { fontSize: 11, color: "#64748B", marginBottom: 5, fontWeight: 600, letterSpacing: "0.05em" },
    grid2:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid3:    { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: "#161B27", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ fontSize: 13, color: p.color, fontWeight: 600 }}>{p.name}: {COP(p.value)}</div>
        ))}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.layout}>

      {/* SIDEBAR */}
      <aside className="sidebar" style={S.sidebar}>
        <div style={{ marginBottom: 32, paddingLeft: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, background: "linear-gradient(135deg,#6366F1,#EC4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Finanzi
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Panel de finanzas</div>
        </div>

        <div style={{ fontSize: 10, color: "#334155", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Navegación</div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {TABS.map(t => (
            <button key={t.id} className={`nav-item ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", padding: "16px 4px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, color: "#334155" }}>Conectado a Supabase</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
            <span style={{ fontSize: 12, color: "#64748B" }}>Sincronizado</span>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main-content" style={S.main}>

        {/* TOPBAR */}
        <div style={S.topbar}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>{MONTHS[month]} {year}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {loading ? "Actualizando..." : `${expenses.length} gastos · ${incomes.length} ingresos`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={month} onChange={e => setMonth(+e.target.value)}
              style={{ ...S.inp, width: "auto", padding: "7px 12px", fontSize: 13 }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <input type="number" value={year} onChange={e => setYear(+e.target.value)}
              style={{ ...S.inp, width: 80, padding: "7px 10px", fontSize: 13 }} />
          </div>
        </div>

        {/* TOAST */}
        {toast && (
          <div style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 999,
            background: toast.type === "ok" ? "linear-gradient(135deg,#059669,#10B981)" : "linear-gradient(135deg,#DC2626,#EF4444)",
            color: "#fff", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeIn 0.3s ease"
          }}>
            {toast.msg}
          </div>
        )}

        {/* PAY ALERT */}
        {payAlerts.length > 0 && (
          <div style={{ margin: "0 28px", marginTop: 20, padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#A5B4FC" }}>Hoy es día de pago</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>
                {payAlerts.map(s => s.name).join(", ")}
              </div>
            </div>
          </div>
        )}

        {/* KPI CARDS */}
        <div style={{ display: "flex", gap: 14, padding: "20px 28px 0", flexWrap: "wrap" }}>
          <KpiCard label="Ingresos totales" value={COP(totalIncome)} color="#10B981" icon="↑" sub={`Q1 ${COP(q1Inc)} · Q2 ${COP(q2Inc)}`} />
          <KpiCard label="Gastos totales"   value={COP(totalSpent)}  color={over(totalSpent, totalBudget) ? "#EF4444" : "#F59E0B"} icon="↓"
            sub={totalBudget > 0 ? `${Math.round(pct(totalSpent, totalBudget))}% del presupuesto` : "Sin presupuesto definido"} />
          <KpiCard label="Balance"          value={COP(balance)}     color={balance >= 0 ? "#10B981" : "#EF4444"} icon={balance >= 0 ? "✓" : "!"}
            sub={balance >= 0 ? "Vas por buen camino" : "Gastas más de lo que ingresas"} />
          {totalDebtMonth > 0 && <KpiCard label="Cuotas / mes" value={COP(totalDebtMonth)} color="#EC4899" icon="◈" sub={`${debts.filter(d => d.paid < d.installments).length} deudas activas`} />}
          {savingGoal > 0 && <KpiCard label="Meta ahorro" value={`${Math.round(savingPct)}%`} color="#6366F1" icon="◎" sub={`${COP(actualSaving)} de ${COP(savingGoal)}`} />}
        </div>

        {/* CONTENT */}
        <div style={S.content} className="fade-in">

          {/* ── RESUMEN ── */}
          {tab === "resumen" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Balance card */}
              <div style={{ ...S.card, background: balance >= 0 ? "linear-gradient(135deg,rgba(16,185,129,0.1),rgba(5,150,105,0.05))" : "linear-gradient(135deg,rgba(239,68,68,0.1),rgba(185,28,28,0.05))", borderColor: balance >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", gridColumn: "1/-1" }}>
                <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>Balance del mes · {MONTHS[month]} {year}</div>
                <div style={{ fontSize: 42, fontWeight: 800, color: balance >= 0 ? "#10B981" : "#EF4444", letterSpacing: "-0.02em" }}>{COP(balance)}</div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{balance >= 0 ? "✅ Vas bien con tus finanzas" : "⚠️ Revisa tus gastos este mes"}</div>
              </div>

              {/* Pie chart */}
              {pieData.length > 0 && (
                <div style={S.card}>
                  <div className="section-title">Distribución de gastos</div>
                  <ResponsiveContainer width="100%" height={230}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                        {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#64748B" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* By category */}
              <div style={S.card}>
                <div className="section-title">Por categoría</div>
                {CATEGORIES.map((cat, ci) => (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 15 }}>{CAT_ICONS[ci]}</span>
                        <span style={{ fontSize: 13, color: "#94A3B8" }}>{cat}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: over(totByCat[cat], budgetByCat[cat]) ? "#EF4444" : "#F1F5F9" }}>
                        {COP(totByCat[cat])}
                      </span>
                    </div>
                    {budgetByCat[cat] > 0 && (
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${pct(totByCat[cat], budgetByCat[cat])}%`, background: over(totByCat[cat], budgetByCat[cat]) ? "#EF4444" : COLORS[ci] }} />
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                    <span style={{ color: "#64748B" }}>Total ingresos</span>
                    <span style={{ color: "#10B981" }}>{COP(totalIncome)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                    <span style={{ color: "#64748B" }}>Total gastos</span>
                    <span style={{ color: "#F59E0B" }}>{COP(totalSpent)}</span>
                  </div>
                </div>
              </div>

              {/* Saving goal */}
              {savingGoal > 0 && (
                <div style={S.card}>
                  <div className="section-title">Meta de ahorro</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#6366F1", marginBottom: 4 }}>{Math.round(savingPct)}%</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>{COP(actualSaving)} de {COP(savingGoal)}</div>
                  <div className="progress-bar" style={{ height: 10 }}>
                    <div className="progress-fill" style={{ width: `${savingPct}%`, background: "linear-gradient(90deg,#6366F1,#8B5CF6)" }} />
                  </div>
                </div>
              )}

              <div style={{ gridColumn: "1/-1" }}>
                <button onClick={exportCSV} style={{ ...S.btnPrim, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#94A3B8" }}>
                  📤 Exportar resumen a CSV
                </button>
              </div>
            </div>
          )}

          {/* ── GASTOS ── */}
          {tab === "gastos" && (
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
              <div>
                <div style={S.card}>
                  <div className="section-title">Nuevo gasto</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={S.label}>DESCRIPCIÓN</div>
                      <input className="inp" placeholder="ej: Almuerzo restaurante" value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={S.inp} />
                    </div>
                    <div>
                      <div style={S.label}>CATEGORÍA</div>
                      <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={S.inp}>
                        {CATEGORIES.map((c, i) => <option key={c}>{CAT_ICONS[i]} {c}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={S.label}>MONTO (COP)</div>
                      <input className="inp" placeholder="0" type="number" value={form.amount}
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={S.inp}
                        onKeyDown={e => e.key === "Enter" && addExpense()} />
                    </div>
                    <button className="btn-primary" onClick={addExpense} style={S.btnPrim}>+ Registrar gasto</button>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!expenses.length
                  ? <Empty text="Sin gastos este mes" icon="📭" />
                  : CATEGORIES.map((cat, ci) => {
                    const catExp = expenses.filter(e => e.category === cat)
                    if (!catExp.length) return null
                    return (
                      <div key={cat} style={S.card}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${COLORS[ci]}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{CAT_ICONS[ci]}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{cat}</div>
                              <div style={{ fontSize: 11, color: "#475569" }}>{catExp.length} gasto{catExp.length !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: over(totByCat[cat], budgetByCat[cat]) ? "#EF4444" : COLORS[ci] }}>
                            {COP(totByCat[cat])}
                          </div>
                        </div>
                        {budgetByCat[cat] > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${pct(totByCat[cat], budgetByCat[cat])}%`, background: over(totByCat[cat], budgetByCat[cat]) ? "#EF4444" : COLORS[ci] }} />
                            </div>
                            <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{Math.round(pct(totByCat[cat], budgetByCat[cat]))}% de {COP(budgetByCat[cat])}</div>
                          </div>
                        )}
                        {catExp.map(e => (
                          <div key={e.id} className="row-item">
                            <span style={{ fontSize: 13, color: "#94A3B8" }}>{e.description}</span>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{COP(e.amount)}</span>
                              <button onClick={() => deleteExpense(e.id)}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}

          {/* ── INGRESOS ── */}
          {tab === "ingresos" && (
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
              <div style={S.card}>
                <div className="section-title">Registrar ingreso</div>
                {sources.length === 0
                  ? <div style={{ color: "#475569", fontSize: 13 }}>Primero agrega una fuente en Fuentes.</div>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={S.label}>FUENTE</div>
                      <select className="inp" value={incForm.source_id} onChange={e => setIncForm(f => ({ ...f, source_id: e.target.value }))} style={S.inp}>
                        <option value="">— Selecciona —</option>
                        {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={S.label}>QUINCENA</div>
                      <select className="inp" value={incForm.quincena} onChange={e => setIncForm(f => ({ ...f, quincena: e.target.value }))} style={S.inp}>
                        <option value="1">1ª Quincena (días 1–15)</option>
                        <option value="2">2ª Quincena (días 16–fin)</option>
                      </select>
                    </div>
                    <div>
                      <div style={S.label}>MONTO (COP)</div>
                      <input className="inp" placeholder="0" type="number" value={incForm.amount}
                        onChange={e => setIncForm(f => ({ ...f, amount: e.target.value }))} style={S.inp} />
                    </div>
                    <button className="btn-primary" onClick={addIncome} style={S.btnPrim}>+ Registrar ingreso</button>
                  </div>
                }
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[["1","1ª Quincena","#6366F1"],["2","2ª Quincena","#10B981"]].map(([q, label, color]) => {
                  const qInc = incomes.filter(i => String(i.quincena) === q)
                  const qTot = qInc.reduce((s, i) => s + Number(i.amount), 0)
                  return (
                    <div key={q} style={{ ...S.card, borderColor: `${color}22` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                          <div style={{ fontSize: 12, color: "#475569" }}>Días {q === "1" ? "1 al 15" : "16 al fin"} del mes</div>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color }}>{COP(qTot)}</div>
                      </div>
                      {!qInc.length ? <div style={{ color: "#334155", fontSize: 13 }}>Sin ingresos en esta quincena.</div>
                        : qInc.map(i => (
                          <div key={i.id} className="row-item">
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                              <span style={{ fontSize: 13, color: "#94A3B8" }}>{i.sources?.name || "—"}</span>
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color }}>{COP(i.amount)}</span>
                              <button onClick={() => deleteIncome(i.id)}
                                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, color: "#EF4444", cursor: "pointer", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── FUENTES ── */}
          {tab === "fuentes" && (
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
              <div style={S.card}>
                <div className="section-title">Nueva fuente</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={S.label}>NOMBRE</div>
                    <input className="inp" placeholder="ej: Salario, Freelance..." value={srcForm.name}
                      onChange={e => setSrcForm(f => ({ ...f, name: e.target.value }))} style={S.inp} />
                  </div>
                  <div style={S.grid2}>
                    <div><div style={S.label}>DÍA PAGO Q1</div><input type="number" min="1" max="15" value={srcForm.day_q1} onChange={e => setSrcForm(f => ({ ...f, day_q1: e.target.value }))} style={S.inp} /></div>
                    <div><div style={S.label}>DÍA PAGO Q2</div><input type="number" min="16" max="31" value={srcForm.day_q2} onChange={e => setSrcForm(f => ({ ...f, day_q2: e.target.value }))} style={S.inp} /></div>
                  </div>
                  <div>
                    <div style={S.label}>MONTO ESPERADO / QUINCENA</div>
                    <input type="number" placeholder="0" value={srcForm.expected}
                      onChange={e => setSrcForm(f => ({ ...f, expected: e.target.value }))} style={S.inp} />
                  </div>
                  <button className="btn-primary" onClick={addSource} style={S.btnPrim}>+ Agregar fuente</button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!sources.length ? <Empty text="No hay fuentes registradas" icon="🏦" />
                  : sources.map((s, si) => {
                    const earned    = incomes.filter(i => i.source_id === s.id).reduce((sum, i) => sum + Number(i.amount), 0)
                    const isPayDay  = s.day_q1 === now.getDate() || s.day_q2 === now.getDate()
                    const color     = COLORS[si % 5]
                    return (
                      <div key={s.id} style={{ ...S.card, borderColor: isPayDay ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💼</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>
                                {isPayDay && <span style={{ marginRight: 6, fontSize: 13 }}>🔔</span>}
                                {s.name}
                              </div>
                              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Q1: día {s.day_q1} · Q2: día {s.day_q2}</div>
                              {s.expected > 0 && <div style={{ fontSize: 12, color: "#475569" }}>Esperado: {COP(s.expected)} / quincena</div>}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#10B981" }}>{COP(earned)}</div>
                            <div style={{ fontSize: 11, color: "#334155" }}>este mes</div>
                            <button onClick={() => deleteSource(s.id)}
                              style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 12, marginTop: 4 }}>Eliminar</button>
                          </div>
                        </div>
                        {s.expected > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${Math.min((earned / (s.expected * 2)) * 100, 100)}%`, background: color }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}

          {/* ── DEUDAS ── */}
          {tab === "deudas" && (
            <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }}>
              <div>
                <div style={S.card}>
                  <div className="section-title">Nueva deuda</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={S.label}>NOMBRE</div>
                      <input className="inp" placeholder="ej: Crédito banco..." value={debtForm.name}
                        onChange={e => setDebtForm(f => ({ ...f, name: e.target.value }))} style={S.inp} />
                    </div>
                    <div style={S.grid2}>
                      <div><div style={S.label}>MONTO TOTAL</div><input type="number" placeholder="0" value={debtForm.total} onChange={e => setDebtForm(f => ({ ...f, total: e.target.value }))} style={S.inp} /></div>
                      <div><div style={S.label}># CUOTAS</div><input type="number" placeholder="0" value={debtForm.installments} onChange={e => setDebtForm(f => ({ ...f, installments: e.target.value }))} style={S.inp} /></div>
                    </div>
                    <div>
                      <div style={S.label}>CUOTAS YA PAGADAS</div>
                      <input type="number" placeholder="0" value={debtForm.paid} onChange={e => setDebtForm(f => ({ ...f, paid: e.target.value }))} style={S.inp} />
                    </div>
                    <div>
                      <div style={S.label}>VALOR CUOTA MENSUAL (COP)</div>
                      <input type="number" placeholder="ej: 157.629" value={debtForm.monthly_payment}
                        onChange={e => setDebtForm(f => ({ ...f, monthly_payment: e.target.value }))} style={S.inp} />
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Si no lo sabes, se calcula automáticamente de total ÷ cuotas</div>
                    </div>
                    <div>
                      <div style={S.label}>FECHA LÍMITE (OPCIONAL)</div>
                      <input type="date" value={debtForm.due_date} onChange={e => setDebtForm(f => ({ ...f, due_date: e.target.value }))} style={S.inp} />
                    </div>
                    <button className="btn-primary" onClick={addDebt} style={S.btnPrim}>+ Registrar deuda</button>
                  </div>
                </div>
                {debts.length > 0 && (
                  <div style={{ ...S.card, marginTop: 14, background: "rgba(236,72,153,0.06)", borderColor: "rgba(236,72,153,0.2)" }}>
                    <div style={{ fontSize: 12, color: "#94A3B8" }}>Compromiso mensual total</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#EC4899", marginTop: 4 }}>{COP(totalDebtMonth)}</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Suma de todas las cuotas activas</div>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!debts.length ? <Empty text="No hay deudas registradas" icon="💳" />
                  : debts.map(d => {
                    const instAmt   = getInstAmt(d)
                    const dpct      = d.installments > 0 ? Math.min((d.paid / d.installments) * 100, 100) : 0
                    const remaining = d.installments - d.paid
                    const isDone    = d.paid >= d.installments
                    return (
                      <div key={d.id} style={{ ...S.card, borderColor: isDone ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.07)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                              <span>{isDone ? "✅" : "💳"}</span> {d.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                              Total: {COP(d.total)} · Cuota: {COP(instAmt)}/mes
                            </div>
                            {d.due_date && <div style={{ fontSize: 12, color: "#64748B" }}>📅 Vence: {d.due_date}</div>}
                          </div>
                          <button onClick={() => deleteDebt(d.id)}
                            style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 12 }}>Eliminar</button>
                        </div>

                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748B", marginBottom: 6 }}>
                            <span>{d.paid} cuotas pagadas</span>
                            <span style={{ fontWeight: 700, color: isDone ? "#10B981" : "#EC4899" }}>{Math.round(dpct)}%</span>
                          </div>
                          <div className="progress-bar" style={{ height: 8 }}>
                            <div className="progress-fill" style={{ width: `${dpct}%`, background: isDone ? "#10B981" : "linear-gradient(90deg,#6366F1,#EC4899)" }} />
                          </div>
                          {!isDone && (
                            <div style={{ fontSize: 12, color: "#EC4899", marginTop: 6 }}>
                              ⏳ {remaining} cuota{remaining !== 1 ? "s" : ""} pendiente{remaining !== 1 ? "s" : ""} · {COP(remaining * instAmt)} restante
                            </div>
                          )}
                          {isDone && <div style={{ fontSize: 12, color: "#10B981", marginTop: 6, fontWeight: 600 }}>¡Deuda saldada! 🎉</div>}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12 }}>
                          <span style={{ fontSize: 12, color: "#475569" }}>Cuotas pagadas:</span>
                          <input type="number" min="0" max={d.installments} value={d.paid}
                            onChange={e => updateDebtPaid(d.id, e.target.value)}
                            style={{ ...S.inp, width: 80, padding: "6px 10px", fontSize: 13 }} />
                          <span style={{ fontSize: 12, color: "#334155" }}>de {d.installments}</span>
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}

          {/* ── PRESUPUESTO ── */}
          {tab === "presupuesto" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 820 }}>
              <div style={S.card}>
                <div className="section-title">Presupuesto del mes</div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>¿Cuánto puedes gastar en total este mes?</div>
                <input type="number" placeholder="ej: 3.000.000" value={budget.total_budget || ""}
                  onChange={e => updateBudget("total_budget", e.target.value)} style={S.inp} />
                {totalBudget > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: "#64748B" }}>Gastado</span>
                      <span style={{ fontWeight: 700, color: over(totalSpent, totalBudget) ? "#EF4444" : "#10B981" }}>
                        {Math.round(pct(totalSpent, totalBudget))}%
                      </span>
                    </div>
                    <div className="progress-bar" style={{ height: 10 }}>
                      <div className="progress-fill" style={{ width: `${pct(totalSpent, totalBudget)}%`, background: over(totalSpent, totalBudget) ? "#EF4444" : "linear-gradient(90deg,#6366F1,#10B981)" }} />
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 6 }}>{COP(totalSpent)} de {COP(totalBudget)}</div>
                  </div>
                )}
              </div>

              <div style={S.card}>
                <div className="section-title">Meta de ahorro</div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>¿Cuánto quieres ahorrar este mes?</div>
                <input type="number" placeholder="ej: 500.000" value={budget.saving_goal || ""}
                  onChange={e => updateBudget("saving_goal", e.target.value)} style={S.inp} />
                {savingGoal > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#6366F1" }}>{Math.round(savingPct)}%</div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{COP(actualSaving)} ahorrado de {COP(savingGoal)}</div>
                    <div className="progress-bar" style={{ marginTop: 8, height: 8 }}>
                      <div className="progress-fill" style={{ width: `${savingPct}%`, background: "linear-gradient(90deg,#6366F1,#8B5CF6)" }} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ ...S.card, gridColumn: "1/-1" }}>
                <div className="section-title">Límite por categoría</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {CATEGORIES.map((cat, ci) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${COLORS[ci]}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{CAT_ICONS[ci]}</div>
                      <span style={{ flex: 1, fontSize: 14, color: "#94A3B8" }}>{cat}</span>
                      <input type="number" placeholder="Sin límite" value={budget[CAT_FIELD[cat]] || ""}
                        onChange={e => updateBudget(CAT_FIELD[cat], e.target.value)}
                        style={{ ...S.inp, width: 180, textAlign: "right" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── HISTORIAL ── */}
          {tab === "historial" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={S.card}>
                <div className="section-title">Ingresos vs Gastos — últimos 6 meses</div>
                {histData.every(d => d.ingresos === 0 && d.gastos === 0)
                  ? <Empty text="Aún no hay datos históricos" icon="📅" />
                  : <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={histData}>
                      <defs>
                        <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#475569", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => "$" + (v / 1000).toFixed(0) + "k"} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, color: "#64748B" }} />
                      <Area type="monotone" dataKey="ingresos" stroke="#6366F1" strokeWidth={2} fill="url(#gi)" name="Ingresos" />
                      <Area type="monotone" dataKey="gastos"   stroke="#EF4444" strokeWidth={2} fill="url(#gg)"  name="Gastos" />
                    </AreaChart>
                  </ResponsiveContainer>
                }
              </div>

              <div style={S.card}>
                <div className="section-title">Detalle por mes</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#334155", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: 700, letterSpacing: "0.05em" }}>
                  <span style={{ width: 50 }}>MES</span>
                  <span style={{ color: "#6366F1" }}>INGRESOS</span>
                  <span style={{ color: "#EF4444" }}>GASTOS</span>
                  <span>BALANCE</span>
                </div>
                {histData.map((d, i) => {
                  const bal = d.ingresos - d.gastos
                  return (
                    <div key={i} className="row-item">
                      <span style={{ fontWeight: 700, fontSize: 14, width: 50, color: "#94A3B8" }}>{d.name}</span>
                      <span style={{ fontSize: 13, color: "#6366F1", fontWeight: 600 }}>{COP(d.ingresos)}</span>
                      <span style={{ fontSize: 13, color: "#EF4444", fontWeight: 600 }}>{COP(d.gastos)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: bal >= 0 ? "#10B981" : "#EF4444" }}>{COP(bal)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

        {/* MOBILE TABS */}
        <div className="mobile-tabs" style={{ display: "none", position: "fixed", bottom: 0, left: 0, right: 0, background: "#0D1117", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px 0", zIndex: 10, justifyContent: "space-around" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 8px", color: tab === t.id ? "#6366F1" : "#475569" }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 600 }}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, icon, sub }) {
  return (
    <div className="kpi-card" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 20px", flex: 1, minWidth: 150, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
      <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Empty({ text, icon }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", color: "#334155" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{text}</div>
    </div>
  )
}
