import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  ScanLine,
  Building2,
  Tag,
  MapPin,
  ListChecks,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Info,
  ArrowRight,
  ArrowDown,
  Layers,
  Ban,
  XCircle,
  HelpCircle,
  RefreshCw,
  Target,
  Inbox,
  Play,
  SkipForward,
  Eye,
  FileText,
  Sparkles,
} from 'lucide-react'

// --- Sample invoice data -----------------------------------------------------
// Vendors, invoice/PO numbers, dollar amounts, and the agent's reasoning trail
// below are synthetic, scripted for this demo. They are not pulled from any
// live inbox, ERP, or vendor master file.

function money(n) {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const STEP_META = {
  extract: { icon: ScanLine, label: 'Extract fields' },
  vendorMatch: { icon: Building2, label: 'Match vendor' },
  glCode: { icon: Tag, label: 'Assign GL code' },
  entityAlloc: { icon: MapPin, label: 'Allocate entity' },
  matchValidate: { icon: ListChecks, label: '3-way match' },
  fraudCheck: { icon: ShieldCheck, label: 'Duplicate & fraud check' },
}

const STEP_ORDER = ['extract', 'vendorMatch', 'glCode', 'entityAlloc', 'matchValidate', 'fraudCheck']

function lineTotal(li) {
  return li.qty * li.unitPrice
}

function invoiceTotal(inv) {
  return Math.round(inv.lineItems.reduce((s, li) => s + lineTotal(li), 0) * 100) / 100
}

const RAW_INVOICES = [
  {
    vendor: 'Uline',
    vendorId: 'VEND-04821',
    invoiceNumber: 'INV-88213',
    poNumber: 'PO-45210',
    entity: 'Acme West LLC',
    costCenter: 'CC-220 · Warehouse Ops',
    date: '2026-08-14',
    lineItems: [
      { desc: 'Shipping cartons, 18x18x18', qty: 200, unitPrice: 1.85 },
      { desc: 'Pallet wrap, stretch film', qty: 40, unitPrice: 9.2 },
    ],
    steps: {
      extract: { detail: 'Parsed 2-page PDF from the AP inbox — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 99 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-04821 (Uline). Banking details on file, vendor not on blocklist.', confidence: 98 },
      glCode: { detail: '61 of the last 64 invoices from this vendor (95%) were coded to GL 6110 · Warehouse Supplies — assigned the same code.', confidence: 95 },
      entityAlloc: { detail: "Ship-to address matches Acme West LLC's dock — allocated to CC-220 · Warehouse Ops.", confidence: 97 },
      matchValidate: { detail: 'Matched against PO-45210: both lines agree on quantity and unit price exactly. Goods receipt confirmed 2026-08-12.', confidence: 100 },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
  {
    vendor: 'Grainger',
    vendorId: 'VEND-09144',
    invoiceNumber: 'INV-51002',
    poNumber: 'PO-45388',
    entity: 'Acme East LLC',
    costCenter: 'CC-118 · Facilities',
    date: '2026-08-15',
    lineItems: [{ desc: 'Safety gloves, case of 12', qty: 15, unitPrice: 34.5 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 99 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-09144 (Grainger). First invoice ever received from this vendor — zero prior processing history.', confidence: 94 },
      glCode: {
        detail: 'No historical coding pattern exists for this vendor. GL 6210 · Facilities Supplies suggested from the spend-category model only.',
        confidence: 61,
        issue: true,
        issueLabel: 'GL-code confidence (61%) is below the 85% threshold required for touchless posting — first invoice from this vendor.',
      },
      entityAlloc: { detail: "Ship-to address matches Acme East LLC's facilities dock — allocated to CC-118 · Facilities.", confidence: 92 },
      matchValidate: { detail: 'Matched against PO-45388: quantity and unit price agree exactly.', confidence: 100 },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
  {
    vendor: 'Sysco Foodservice',
    vendorId: 'VEND-02217',
    invoiceNumber: 'INV-77602',
    poNumber: 'PO-45177',
    entity: 'Acme West LLC',
    costCenter: 'CC-305 · Cafeteria Ops',
    date: '2026-08-15',
    lineItems: [{ desc: 'Bulk paper towels, case', qty: 120, unitPrice: 22.1, poQty: 100 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 98 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-02217 (Sysco Foodservice). Banking details on file.', confidence: 99 },
      glCode: { detail: '44 of the last 47 invoices from this vendor (94%) were coded to GL 6340 · Cafeteria Supplies — assigned the same code.', confidence: 94 },
      entityAlloc: { detail: "Ship-to address matches Acme West LLC's cafeteria dock — allocated to CC-305 · Cafeteria Ops.", confidence: 96 },
      matchValidate: {
        detail: 'Matched against PO-45177: line 1 invoiced qty 120 vs. PO qty 100 — a 20-unit variance ($442.00) that exceeds the 5% tolerance.',
        confidence: 58,
        issue: true,
        issueLabel: 'Invoiced quantity (120) exceeds PO-45177 quantity (100) by 20 units — above the 5% tolerance for touchless posting.',
      },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
  {
    vendor: 'Staples Business',
    vendorId: 'VEND-01193',
    invoiceNumber: 'INV-30044',
    poNumber: 'PO-45402',
    entity: 'Acme East LLC',
    costCenter: 'CC-101 · Office Admin',
    date: '2026-08-16',
    lineItems: [{ desc: 'Copy paper, case of 10 reams', qty: 50, unitPrice: 38.75 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 99 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-01193 (Staples Business). Banking details on file.', confidence: 99 },
      glCode: { detail: '118 of the last 121 invoices from this vendor (98%) were coded to GL 6050 · Office Supplies — assigned the same code.', confidence: 98 },
      entityAlloc: { detail: "Ship-to address matches Acme East LLC's admin office — allocated to CC-101 · Office Admin.", confidence: 98 },
      matchValidate: { detail: 'Matched against PO-45402: quantity and unit price agree exactly.', confidence: 100 },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
  {
    vendor: 'Office Depot',
    vendorId: 'VEND-03361',
    invoiceNumber: 'INV-77414',
    poNumber: 'PO-45390',
    entity: 'Acme East LLC',
    costCenter: 'CC-101 · Office Admin',
    date: '2026-08-14',
    lineItems: [{ desc: 'Toner cartridges, black HY', qty: 16, unitPrice: 77.5 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 99 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-03361 (Office Depot). Banking details on file.', confidence: 99 },
      glCode: { detail: '85 of the last 90 invoices from this vendor (94%) were coded to GL 6050 · Office Supplies — assigned the same code.', confidence: 94 },
      entityAlloc: { detail: "Ship-to address matches Acme East LLC's admin office — allocated to CC-101 · Office Admin.", confidence: 97 },
      matchValidate: { detail: 'Matched against PO-45390: quantity and unit price agree exactly.', confidence: 100 },
      fraudCheck: {
        detail: 'Digital fingerprint matches invoice INV-77410, submitted 2026-08-11 from the same vendor for the identical amount ($1,240.00) against the same PO.',
        confidence: 34,
        issue: true,
        issueLabel: 'Probable duplicate of INV-77410 (submitted 2026-08-11, same vendor, same $1,240.00, same PO-45390) — held pending confirmation before payment.',
      },
    },
  },
  {
    vendor: 'Fastenal',
    vendorId: 'VEND-06650',
    invoiceNumber: 'INV-19087',
    poNumber: 'PO-45261',
    entity: 'Acme West LLC',
    costCenter: 'CC-220 · Warehouse Ops',
    date: '2026-08-17',
    lineItems: [{ desc: 'Stainless bolts, 3/8in, box of 100', qty: 30, unitPrice: 14.97, poUnitPrice: 15.0 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 99 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-06650 (Fastenal). Banking details on file.', confidence: 99 },
      glCode: { detail: '29 of the last 31 invoices from this vendor (94%) were coded to GL 6110 · Warehouse Supplies — assigned the same code.', confidence: 94 },
      entityAlloc: { detail: "Ship-to address matches Acme West LLC's dock — allocated to CC-220 · Warehouse Ops.", confidence: 96 },
      matchValidate: { detail: 'Matched against PO-45261: unit price is $0.03 under PO ($14.97 vs. $15.00), a $0.90 total variance — within the $5.00 tolerance. Auto-matched.', confidence: 96 },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
  {
    vendor: 'ABC Supply Co.',
    vendorId: 'VEND-05528',
    invoiceNumber: 'INV-66210',
    poNumber: 'PO-45330',
    entity: 'Acme West LLC',
    costCenter: 'CC-241 · Facilities',
    date: '2026-08-18',
    lineItems: [{ desc: 'Drywall sheets, 4x8, 1/2in', qty: 60, unitPrice: 11.4 }],
    steps: {
      extract: { detail: 'Parsed 1-page PDF — invoice #, date, remit-to address, and total extracted via ZenLM document model.', confidence: 98 },
      vendorMatch: { detail: 'Remit-to address matched vendor master record VEND-05528 (ABC Supply Co.). Banking details on file.', confidence: 98 },
      glCode: { detail: '52 of the last 55 invoices from this vendor (95%) were coded to GL 6210 · Facilities Supplies — assigned the same code.', confidence: 95 },
      entityAlloc: { detail: "Ship-to address matches Acme West LLC's facilities dock — allocated to CC-241 · Facilities.", confidence: 95 },
      matchValidate: { detail: 'Matched against PO-45330: quantity and unit price agree exactly.', confidence: 100 },
      fraudCheck: { detail: 'Checked against 90 days of invoice history and digital fingerprint — no duplicate, no anomaly.', confidence: 100 },
    },
  },
]

const INVOICES = RAW_INVOICES.map((inv, i) => {
  const trail = STEP_ORDER.map((phase) => ({ phase, ...inv.steps[phase] }))
  const issueStep = trail.find((s) => s.issue)
  return {
    id: i + 1,
    ...inv,
    total: invoiceTotal(inv),
    trail,
    outcome: issueStep ? 'flagged' : 'posted',
    outcomeReason: issueStep ? issueStep.issueLabel : null,
  }
})

const STEP_DELAY_MS = 650
const DECISION_DELAY_MS = 550
const SETTLE_DELAY_MS = 900

// --- Reasoning trail UI --------------------------------------------------------

function ConfidenceChip({ value }) {
  const tone =
    value >= 90
      ? 'text-emerald-400 ring-emerald-500/30 bg-emerald-500/10'
      : value >= 75
      ? 'text-sky-400 ring-sky-500/30 bg-sky-500/10'
      : 'text-amber-400 ring-amber-500/30 bg-amber-500/10'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-mono font-medium ring-1 ring-inset ${tone}`}>
      {value}% confidence
    </span>
  )
}

function TrailStep({ step, visible }) {
  const meta = STEP_META[step.phase]
  const Icon = step.issue ? AlertTriangle : meta.icon
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-all duration-500 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      } ${step.issue ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-slate-800 bg-slate-900/40'}`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          step.issue ? 'bg-amber-500/10 text-amber-400' : 'bg-sky-500/10 text-sky-400'
        }`}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{meta.label}</span>
          {typeof step.confidence === 'number' && <ConfidenceChip value={step.confidence} />}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{step.detail}</p>
      </div>
    </div>
  )
}

function ThinkingStep() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-400">
        <Loader2 size={14} className="animate-spin" />
      </div>
      <span className="text-sm text-slate-500">Agent is working on the next step…</span>
    </div>
  )
}

function DecisionBanner({ invoice, visible }) {
  if (!visible) return null
  const posted = invoice.outcome === 'posted'
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3.5 transition-all duration-500 ${
        posted ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10'
      }`}
    >
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${posted ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
        {posted ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}
      </div>
      <div>
        <div className={`text-sm font-semibold ${posted ? 'text-emerald-300' : 'text-amber-300'}`}>
          {posted ? `Posted to ERP — zero-touch, ${money(invoice.total)}` : 'Flagged for AP specialist review'}
        </div>
        <div className="mt-0.5 text-xs text-slate-400">
          {posted
            ? 'Every check above passed at or above its confidence threshold. No human touched this invoice.'
            : invoice.outcomeReason}
        </div>
      </div>
    </div>
  )
}

function InvoicePanel({ invoice, revealCount, decisionShown, thinking }) {
  if (!invoice) {
    return (
      <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-800 text-center text-slate-500">
        <Inbox size={28} className="text-slate-700" />
        <p className="max-w-xs text-sm">Select an invoice from the queue, or click “Process next invoice” to watch the agent work.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <FileText size={13} />
            {invoice.invoiceNumber} · {invoice.poNumber}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-100">{invoice.vendor}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {invoice.entity} · {invoice.costCenter} · {invoice.date}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-xl font-semibold text-slate-100">{money(invoice.total)}</div>
          <div className="text-xs text-slate-500">{invoice.lineItems.length} line item{invoice.lineItems.length > 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {invoice.trail.map((step, i) => (
          <TrailStep key={step.phase} step={step} visible={i < revealCount} />
        ))}
        {thinking && <ThinkingStep />}
      </div>

      <DecisionBanner invoice={invoice} visible={decisionShown} />
    </div>
  )
}

// --- Queue + stats --------------------------------------------------------------

function QueueRow({ invoice, onSelect, selected, isActive }) {
  return (
    <button
      onClick={() => onSelect(invoice.id)}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected ? 'border-sky-500/50 bg-sky-500/[0.06]' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
      }`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-200">{invoice.vendor}</div>
        <div className="text-xs text-slate-500">{invoice.invoiceNumber}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-xs text-slate-400">{money(invoice.total)}</span>
        {isActive && <Loader2 size={13} className="animate-spin text-sky-400" />}
      </div>
    </button>
  )
}

function HistoryRow({ invoice, onSelect, selected }) {
  const posted = invoice.outcome === 'posted'
  return (
    <button
      onClick={() => onSelect(invoice.id)}
      className={`flex w-full items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-2.5 text-left text-sm transition-colors last:border-b-0 ${
        selected ? 'bg-sky-500/[0.06]' : 'hover:bg-slate-800/40'
      }`}
    >
      <div className="min-w-0">
        <span className="font-medium text-slate-200">{invoice.vendor}</span>
        <span className="ml-2 text-xs text-slate-500">{invoice.invoiceNumber}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="font-mono text-xs text-slate-400">{money(invoice.total)}</span>
        {posted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            <CheckCircle2 size={11} /> posted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30">
            <AlertTriangle size={11} /> flagged
          </span>
        )}
        <Eye size={13} className="text-slate-600" />
      </div>
    </button>
  )
}

function StatCard({ label, value, sub, tone = 'text-slate-100' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1.5 font-mono text-2xl font-semibold ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function AgentView() {
  const [queue, setQueue] = useState(() => INVOICES.map((i) => i.id))
  const [history, setHistory] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [revealCount, setRevealCount] = useState(0)
  const [decisionShown, setDecisionShown] = useState(false)
  const [autoRun, setAutoRun] = useState(false)
  const timers = useRef([])

  const byId = useMemo(() => Object.fromEntries(INVOICES.map((i) => [i.id, i])), [])

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  const processNext = useCallback(() => {
    setQueue((q) => {
      if (activeId !== null || q.length === 0) return q
      const [id, ...rest] = q
      const invoice = byId[id]

      setActiveId(id)
      setSelectedId(id)
      setRevealCount(0)
      setDecisionShown(false)

      invoice.trail.forEach((_, i) => {
        const t = setTimeout(() => setRevealCount((c) => Math.max(c, i + 1)), STEP_DELAY_MS * (i + 1))
        timers.current.push(t)
      })
      const decisionAt = STEP_DELAY_MS * invoice.trail.length + DECISION_DELAY_MS
      timers.current.push(setTimeout(() => setDecisionShown(true), decisionAt))
      timers.current.push(
        setTimeout(() => {
          setHistory((h) => [id, ...h])
          setActiveId(null)
        }, decisionAt + SETTLE_DELAY_MS),
      )

      return rest
    })
  }, [activeId, byId])

  // Drive auto-run: whenever nothing is active and auto-run is on, kick the next one
  useEffect(() => {
    if (autoRun && activeId === null && queue.length > 0) {
      const t = setTimeout(() => processNext(), 250)
      timers.current.push(t)
    }
    if (autoRun && queue.length === 0 && activeId === null) {
      setAutoRun(false)
    }
  }, [autoRun, activeId, queue.length, processNext])

  const displayed = selectedId ? byId[selectedId] : null
  const displayedIsActive = selectedId !== null && selectedId === activeId
  const displayRevealCount = displayedIsActive ? revealCount : displayed ? displayed.trail.length : 0
  const displayDecisionShown = displayedIsActive ? decisionShown : Boolean(displayed)
  const thinking = displayedIsActive && revealCount < (displayed?.trail.length ?? 0)

  const stats = useMemo(() => {
    const processed = history.map((id) => byId[id])
    const posted = processed.filter((i) => i.outcome === 'posted')
    const flagged = processed.filter((i) => i.outcome === 'flagged')
    const postedAmount = posted.reduce((s, i) => s + i.total, 0)
    const rate = processed.length ? Math.round((posted.length / processed.length) * 100) : 0
    return { processed: processed.length, posted: posted.length, flagged: flagged.length, postedAmount, rate }
  }, [history, byId])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] px-4 py-3 text-xs text-sky-200/80">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-sky-400" />
        <p>
          Every card below is the literal step the agent took and the exact evidence it used — not a progress bar. When
          the agent can&apos;t clear its own confidence threshold, it says so and routes to a human instead of guessing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Processed" value={stats.processed} sub={`${queue.length} left in queue`} />
        <StatCard label="Touchless rate" value={`${stats.rate}%`} tone="text-emerald-400" sub={`${stats.posted} auto-posted`} />
        <StatCard label="Flagged for review" value={stats.flagged} tone="text-amber-400" sub="exact reason shown per invoice" />
        <StatCard label="Auto-posted value" value={money(stats.postedAmount)} sub="booked with zero human touch" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Queue */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Inbox size={15} className="text-sky-400" />
                Invoice queue
              </div>
              <span className="font-mono text-xs text-slate-500">{queue.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {queue.length === 0 && <p className="text-xs text-slate-500">Queue is empty — every invoice has been processed.</p>}
              {queue.map((id) => (
                <QueueRow key={id} invoice={byId[id]} onSelect={setSelectedId} selected={selectedId === id} isActive={activeId === id} />
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={processNext}
                disabled={activeId !== null || queue.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
              >
                <Play size={14} />
                Process next invoice
              </button>
              <button
                onClick={() => setAutoRun(true)}
                disabled={autoRun || queue.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SkipForward size={14} />
                {autoRun ? 'Running…' : 'Run all remaining'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60">
            <div className="border-b border-slate-800 px-4 py-3 text-sm font-medium text-slate-200">Processed — audit trail retained</div>
            {history.length === 0 ? (
              <p className="px-4 py-4 text-xs text-slate-500">Processed invoices will appear here — click any row later to re-open its full reasoning trail.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {history.map((id) => (
                  <HistoryRow key={id} invoice={byId[id]} onSelect={setSelectedId} selected={selectedId === id} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main panel */}
        <InvoicePanel invoice={displayed} revealCount={displayRevealCount} decisionShown={displayDecisionShown} thinking={thinking} />
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          Sample data only — vendors, invoice/PO numbers, and dollar amounts are scripted for this demo, not pulled from
          a live inbox or ERP. The decision logic (what triggers auto-post vs. a flag, and why) mirrors how an
          explainable AP agent would evaluate each check.
        </p>
      </div>
    </div>
  )
}

// --- Vision & requirements view -------------------------------------------------

const ARCH_STEPS = [
  {
    title: 'Invoice intake & routing',
    detail: 'Supplier emails and billing documents land in the AP inbox and get routed here. A separate product line (AP Inbox Service Center) — assumed as input, not built in this prototype.',
    icon: Inbox,
    status: 'adjacent',
  },
  {
    title: 'Field extraction',
    detail: 'ZenLM-style document parsing reads header fields and line items off the invoice. Simulated with scripted confidence scores in this prototype.',
    icon: ScanLine,
    status: 'built',
  },
  {
    title: 'Vendor matching',
    detail: 'Remit-to details matched against the vendor master file, including a blocklist check. Simulated in this prototype.',
    icon: Building2,
    status: 'built',
  },
  {
    title: 'GL coding',
    detail: 'GL code assigned from historical coding patterns for that vendor, or flagged when confidence is too low (e.g. first-time vendors). Simulated in this prototype.',
    icon: Tag,
    status: 'built',
  },
  {
    title: 'Entity & cost-center allocation',
    detail: 'Ship-to/remit-to signals allocate the invoice to the right legal entity and cost center. Simulated in this prototype.',
    icon: MapPin,
    status: 'built',
  },
  {
    title: 'Line-item / 3-way match validation',
    detail: 'Invoice lines checked against PO and goods receipt, with an explicit tolerance for rounding/price variance. Simulated in this prototype.',
    icon: ListChecks,
    status: 'built',
  },
  {
    title: 'Duplicate & fraud detection',
    detail: "Digital fingerprinting cross-checks against recent invoice history to catch duplicate submissions. Simulated with a scripted pattern, not a trained detector, in this prototype.",
    icon: ShieldCheck,
    status: 'built',
  },
  {
    title: 'Explainable decision',
    detail: 'Auto-post or flag, with the exact reason surfaced and retained as an audit trail. This is the core mechanic built in this prototype.',
    icon: CheckCircle2,
    status: 'built',
  },
  {
    title: 'ERP write-back',
    detail: 'Auto-posted invoices actually book into SAP S/4HANA, Oracle Fusion, Workday, or NetSuite via native connectors. Not built — this prototype only simulates the "posted" status.',
    icon: RefreshCw,
    status: 'planned',
  },
  {
    title: 'Exception workspace',
    detail: 'Flagged invoices get assigned, commented on, resolved, and reprocessed by an AP specialist. Not built — this prototype only surfaces the flag and its reason.',
    icon: ShieldAlert,
    status: 'planned',
  },
  {
    title: 'Continuous learning loop',
    detail: 'Specialist corrections on GL codes and vendor matches feed back into the confidence model, raising the touchless rate over time. Not built.',
    icon: Layers,
    status: 'planned',
  },
]

const NON_GOALS = [
  'Not rebuilding AP Inbox Service Center — email intake and routing is a separate product line, assumed as input here.',
  'Not rebuilding E-Invoicing / country VAT compliance — a separate product line, out of scope here.',
  'No live ERP write-back — decisions are simulated, not actually posted to SAP, Oracle, Workday, or NetSuite.',
  'No real OCR/LLM document parsing — extraction steps are scripted for these demo invoices, not run against real PDFs.',
  'No exception-handling workflow (assign, comment, resolve, reprocess) — flags surface but aren\'t yet workable by a team.',
  'No trained fraud/deepfake detection model — the duplicate check is an illustrative scripted pattern.',
]

const OPEN_QUESTIONS = [
  {
    q: 'Confidence threshold ownership',
    detail: 'What GL-code / vendor-match confidence should be required before auto-post is allowed, and does that threshold vary by entity or spend category?',
  },
  {
    q: 'Audit retention',
    detail: 'How long must the reasoning trail be retained, and does it need to be exportable in a specific format for SOX or external audit?',
  },
  {
    q: 'Exception ownership',
    detail: 'Does a flagged invoice route to the AP specialist who normally owns that vendor, or to a pooled exception queue?',
  },
  {
    q: 'Override propagation',
    detail: 'When a specialist corrects an AI-assigned GL code, does that correction retrain the model immediately, or batch overnight?',
  },
  {
    q: 'New-vendor handling',
    detail: 'For a vendor with zero invoice history, should the agent ever auto-post, or always route the first N invoices to a human regardless of confidence?',
  },
]

const PHASES = [
  {
    label: 'Phase 1 · Built',
    scope: 'Single-invoice explainable processing: extraction, vendor match, GL coding, entity allocation, 3-way match, duplicate check, and an explainable auto-post/flag decision — this is the Autonomous AP tab today.',
  },
  {
    label: 'Phase 2',
    scope: 'Batch processing plus a real exception workspace for flagged invoices — assign, comment, resolve, and reprocess.',
  },
  {
    label: 'Phase 3',
    scope: 'Live ERP write-back connectors (SAP S/4HANA, Oracle Fusion, Workday, NetSuite) so auto-posted invoices actually book.',
  },
  {
    label: 'Phase 4',
    scope: 'Continuous learning loop — specialist corrections on GL codes and vendor matches feed back into confidence scoring, raising the touchless rate over time.',
  },
]

function SectionCard({ icon: Icon, title, sub, children }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon size={15} className="text-sky-400" />
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      </div>
      {sub && <p className="mb-4 text-xs text-slate-500">{sub}</p>}
      {children}
    </div>
  )
}

function StepStatusBadge({ status }) {
  if (status === 'built') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
        built
      </span>
    )
  }
  if (status === 'adjacent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-400 ring-1 ring-inset ring-sky-500/30">
        separate product
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 ring-1 ring-inset ring-slate-600/50">
      not yet built
    </span>
  )
}

function VisionView() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-xs text-slate-400">
        This reframes the project as a pre-launch requirements review. The <span className="text-slate-200">Autonomous AP</span> tab
        is Phase 1 — one invoice, fully explained, end to end. Everything below is the surface that hasn&apos;t been built: writing
        back to the ERP, giving AP specialists a real workspace for exceptions, and learning from their corrections.
      </div>

      <SectionCard icon={AlertTriangle} title="The problem this solves" sub="Why AP teams don't trust automation today.">
        <p className="text-sm leading-relaxed text-slate-300">
          Manual AP means someone reads every invoice, guesses the GL code, figures out which entity it belongs to, and
          checks it against a PO by hand — slow, inconsistent, and it doesn&apos;t scale. Automation exists to fix that, but
          most of it is a black box: an invoice goes in, a status comes out, and nobody — not the AP specialist, not an
          external auditor — can see why the system decided what it decided. That's the actual reason AI-driven AP tools
          struggle to earn trust: not that the decisions are wrong, but that they're invisible. AppZen's own customers
          named this directly as their top ask — transparent audit trails that show exactly why an agent flagged or
          approved a given spend. This prototype treats that as the product, not an afterthought.
        </p>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Target size={15} className="text-sky-400" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Target</span>
          </div>
          <div className="font-mono text-xl font-semibold text-sky-300">70%+ touchless</div>
          <div className="mt-1 text-xs text-slate-400">
            Most invoices post to the ERP with zero human interaction, freeing AP specialists to work exceptions instead
            of keying data.
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-2 flex items-center gap-2">
            <Target size={15} className="text-sky-400" />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Target</span>
          </div>
          <div className="font-mono text-xl font-semibold text-sky-300">100% explainable</div>
          <div className="mt-1 text-xs text-slate-400">
            Every decision — auto-posted or flagged — carries a retained reasoning trail an AP specialist or external
            auditor can open later, not just at the moment it happened.
          </div>
        </div>
      </div>

      <SectionCard icon={Layers} title="System architecture" sub="What this actually requires, end to end.">
        <div className="flex flex-col">
          {ARCH_STEPS.map((s, i) => {
            const StepIcon = s.icon
            return (
              <div key={s.title}>
                <div className="flex items-start gap-3 py-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      s.status === 'built'
                        ? 'border-emerald-500/50 text-emerald-400'
                        : s.status === 'adjacent'
                        ? 'border-sky-500/50 text-sky-400'
                        : 'border-slate-600 text-slate-400'
                    }`}
                  >
                    <StepIcon size={15} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{s.title}</span>
                      <StepStatusBadge status={s.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">{s.detail}</div>
                  </div>
                </div>
                {i < ARCH_STEPS.length - 1 && (
                  <div className="ml-4 flex h-4 items-center">
                    <ArrowDown size={12} className="text-slate-700" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard icon={Ban} title="Non-goals (this prototype)" sub="What we're explicitly not building here.">
          <ul className="flex flex-col gap-2.5">
            {NON_GOALS.map((n) => (
              <li key={n} className="flex items-start gap-2 text-xs text-slate-400">
                <XCircle size={13} className="mt-0.5 shrink-0 text-rose-400" />
                {n}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={HelpCircle} title="Open questions" sub="Decisions this room needs to make.">
          <ul className="flex flex-col gap-3">
            {OPEN_QUESTIONS.map((o) => (
              <li key={o.q} className="text-xs">
                <span className="font-medium text-slate-200">{o.q}. </span>
                <span className="text-slate-400">{o.detail}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard icon={RefreshCw} title="Phasing" sub="What ships first, and why.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((p) => (
            <div key={p.label} className="rounded-lg border border-slate-800 p-4">
              <div className="mb-2 font-mono text-xs text-sky-400">{p.label}</div>
              <div className="text-xs text-slate-400">{p.scope}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// --- App shell ------------------------------------------------------------------

const TABS = [
  { key: 'agent', label: 'Autonomous AP' },
  { key: 'vision', label: 'Vision & requirements' },
]

export default function App() {
  const [view, setView] = useState('agent')

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Autonomous AP — Prototype
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
              {view === 'agent' ? 'Invoice processing agent' : 'Vision & requirements'}
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              {view === 'agent'
                ? 'Every invoice below is processed end to end — extraction, GL coding, entity allocation, and line-item validation — with the agent narrating exactly what it did and why, before it auto-posts or flags for review.'
                : 'The invoice agent tab is Phase 1 only. This is the requirements review for what a production Autonomous AP needs: ERP write-back, a real exception workspace, and a feedback loop that keeps the agent improving.'}
            </p>
          </div>

          <div className="flex gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  view === t.key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'agent' ? <AgentView /> : <VisionView />}
      </div>
    </div>
  )
}
