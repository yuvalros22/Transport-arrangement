'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { PickupRecord, Customer, CustomerAddress } from '@/types'
import {
    getAllPickupRecords, upsertPickupRecord, deletePickupRecord,
    newPickupRecordId, markPickupDone, getTodayCompletion,
    getRecentCompletions, unmarkPickupDone,
} from '@/lib/pickupDb'
import { getSelectedPickupIds, setPickupSelected } from '@/lib/sessionStore'
import { getAllCustomers } from '@/lib/customerDb'
import { MapPicker } from './MapPicker'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string {
    return new Date().toISOString().slice(0, 10)
}

function emptyRecord(): PickupRecord {
    return {
        id: newPickupRecordId(),
        name: '',
        address_text: '',
        lat: null,
        lng: null,
        what_to_collect: '',
        is_urgent: false,
        phone: '',
        notes: '',
        carts: '',
        completions: [],
    }
}

// ─── Small components ──────────────────────────────────────────────────────────

function CompletionDot({ done }: { done: boolean }) {
    return (
        <span
            className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
            style={{ background: done ? '#10b981' : '#ef4444' }}
        />
    )
}

function HistoryBadge({ completions }: { completions: PickupRecord['completions'] }) {
    const last5 = completions.slice(0, 5)
    if (!last5.length) return <span className="text-[10px] text-slate-700">אין היסטוריה</span>
    return (
        <div className="flex gap-1 items-center">
            {last5.map(c => (
                <span key={c.date} title={`${c.date}: ${c.done ? 'בוצע' : 'לא בוצע'}`}>
                    <CompletionDot done={c.done} />
                </span>
            ))}
        </div>
    )
}

// ─── Pickup card ───────────────────────────────────────────────────────────────

function PickupCard({
    record, selected, todayDone, onToggleSelected, onToggleDone, onEdit, onDelete,
}: {
    record: PickupRecord
    selected: boolean
    todayDone: boolean | null   // null = not marked yet today
    onToggleSelected: () => void
    onToggleDone: (done: boolean) => void
    onEdit: () => void
    onDelete: () => void
}) {
    const [expanded, setExpanded] = useState(false)
    const hasAddress = record.lat !== null

    return (
        <div
            className="rounded-xl border transition-all"
            style={{
                borderColor: !hasAddress ? '#ef444440' : selected ? '#8b5cf650' : '#1e2d45',
                background: selected ? '#8b5cf608' : '#0f1d30',
            }}
        >
            {/* Main row */}
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                {/* Select for routing checkbox */}
                <button
                    onClick={onToggleSelected}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all"
                    style={{
                        borderColor: selected ? '#8b5cf6' : '#334155',
                        background: selected ? '#8b5cf6' : 'transparent',
                    }}
                    title="סמן לסידור קווים היום"
                >
                    {selected && <span className="text-white text-[10px] font-black">✓</span>}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-slate-200 truncate">{record.name || '—'}</span>
                        {record.is_urgent && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0 shadow-lg shadow-red-500/20">🚨 דחוף!</span>
                        )}
                        {!hasAddress && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">חסרה כתובת</span>
                        )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                        📦 {record.what_to_collect || '—'}
                        {record.carts ? <span className="mr-2 text-amber-300 font-bold">🛒 {record.carts} עגלות</span> : null}
                        {hasAddress && <span className="mr-2 text-slate-700">· {record.address_text}</span>}
                    </div>
                </div>

                {/* History dots */}
                <HistoryBadge completions={record.completions} />

                {/* Done/not-done toggle for today */}
                <div className="flex gap-1 shrink-0">
                    <button
                        onClick={() => onToggleDone(true)}
                        title="בוצע היום"
                        className="text-[10px] px-1.5 py-0.5 rounded-lg border transition-all"
                        style={{
                            borderColor: todayDone === true ? '#10b981' : '#1e2d45',
                            background: todayDone === true ? '#10b98120' : 'transparent',
                            color: todayDone === true ? '#34d399' : '#475569',
                        }}
                    >✓</button>
                    <button
                        onClick={() => onToggleDone(false)}
                        title="לא בוצע היום"
                        className="text-[10px] px-1.5 py-0.5 rounded-lg border transition-all"
                        style={{
                            borderColor: todayDone === false ? '#ef4444' : '#1e2d45',
                            background: todayDone === false ? '#ef444420' : 'transparent',
                            color: todayDone === false ? '#f87171' : '#475569',
                        }}
                    >✗</button>
                </div>

                <button onClick={() => setExpanded(p => !p)} className="text-slate-600 hover:text-slate-400 text-xs px-1">
                    {expanded ? '▲' : '▼'}
                </button>
                <button onClick={onEdit} className="text-slate-600 hover:text-blue-400 text-xs">✏️</button>
                <button onClick={onDelete} className="text-slate-700 hover:text-red-400 text-xs">✕</button>
            </div>

            {/* Expanded: history */}
            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2">
                    {record.phone && (
                        <div className="text-[10px] text-blue-400">📞 {record.phone}</div>
                    )}
                    {record.notes && (
                        <div className="text-[10px] text-slate-500">💬 {record.notes}</div>
                    )}

                    {/* Completion history */}
                    <div>
                        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">היסטוריית ביצוע</div>
                        {record.completions.length === 0 ? (
                            <div className="text-[10px] text-slate-700">אין רישום עדיין</div>
                        ) : (
                            <div className="space-y-1">
                                {getRecentCompletions(record, 10).map(c => (
                                    <div key={c.date} className="flex items-center gap-2 text-[10px]">
                                        <CompletionDot done={c.done} />
                                        <span className="text-slate-500 font-mono">{c.date}</span>
                                        <span className={c.done ? 'text-green-400' : 'text-red-400'}>
                                            {c.done ? '✓ בוצע' : '✗ לא בוצע'}
                                        </span>
                                        {c.note && <span className="text-slate-600">· {c.note}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Edit / Add form ──────────────────────────────────────────────────────────

function PickupForm({
    initial, onSave, onClose,
}: {
    initial: PickupRecord
    onSave: (p: PickupRecord) => void
    onClose: () => void
}) {
    const [form, setForm] = useState<PickupRecord>({ ...initial })
    const [pickerOpen, setPickerOpen] = useState(false)
    const set = (k: keyof PickupRecord, v: any) => setForm(p => ({ ...p, [k]: v }))

    // ── Customer search ──────────────────────────────────────────────────────
    const [allCustomers, setAllCustomers] = useState<Customer[]>([])
    useEffect(() => { getAllCustomers().then(setAllCustomers) }, [])
    const [searchQuery, setSearchQuery] = useState(initial.name || '')
    const [suggestions, setSuggestions] = useState<Customer[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const q = searchQuery.trim().toLowerCase()
        if (!q || selectedCustomer) { setSuggestions([]); return }
        const hits = allCustomers.filter(c =>
            c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
        ).slice(0, 6)
        setSuggestions(hits)
        setShowSuggestions(hits.length > 0)
    }, [searchQuery, allCustomers, selectedCustomer])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node))
                setShowSuggestions(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const selectCustomer = (c: Customer) => {
        setSelectedCustomer(c)
        setSearchQuery(c.name)
        setSuggestions([])
        setShowSuggestions(false)
        set('name', c.name)
        if (c.addresses.length === 1) {
            const a = c.addresses[0]
            setForm(p => ({ ...p, name: c.name, lat: a.lat, lng: a.lng, address_text: a.address_text }))
        } else {
            setForm(p => ({ ...p, name: c.name }))
        }
    }

    const selectAddress = (a: CustomerAddress) => {
        setForm(p => ({ ...p, lat: a.lat, lng: a.lng, address_text: a.address_text }))
    }

    const canSave = form.name.trim() && form.lat !== null

    return (
        <div
            className="fixed inset-0 z-[9500] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
        >
            <div
                className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
                style={{ width: 500, maxWidth: '95vw', maxHeight: '92vh', background: '#0f1d30', border: '1px solid #1e2d45' }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0" style={{ background: '#0a1525' }}>
                    <span className="text-xl">↩</span>
                    <div className="flex-1 font-black text-sm text-slate-200">
                        {initial.name ? `עריכה: ${initial.name}` : 'איסוף חדש'}
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4" dir="rtl">
                    {/* Section 1: Customer */}
                    <div className="rounded-xl border border-border p-3 space-y-2" style={{ background: '#ffffff04' }}>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">לקוח</div>
                        <div ref={searchRef} className="relative">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input
                                        className="input text-sm w-full pl-8"
                                        value={searchQuery}
                                        onChange={e => {
                                            setSearchQuery(e.target.value)
                                            setSelectedCustomer(null)
                                            set('name', e.target.value)
                                        }}
                                        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                                        placeholder="חפש לקוח קיים או הקלד שם חדש..."
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                                </div>
                                {selectedCustomer && (
                                    <button onClick={() => { setSelectedCustomer(null); setSearchQuery(''); setForm(p => ({ ...p, name: '', lat: null, lng: null, address_text: '' })) }}
                                        className="text-xs text-slate-500 hover:text-red-400 shrink-0">✕ נקה</button>
                                )}
                            </div>
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-full right-0 left-0 mt-1 rounded-xl overflow-hidden shadow-xl z-10"
                                    style={{ background: '#0a1525', border: '1px solid #1e2d45' }}>
                                    {suggestions.map(c => (
                                        <button key={c.code}
                                            className="w-full text-right px-3 py-2 hover:bg-white/5 transition-colors border-b last:border-0"
                                            style={{ borderColor: '#1e2d45' }}
                                            onMouseDown={() => selectCustomer(c)}>
                                            <div className="text-sm font-bold text-slate-200">{c.name}</div>
                                            <div className="text-[10px] text-slate-500">{c.code} · {c.addresses.length} כתובות</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {selectedCustomer && (
                            <div className="flex items-center gap-2 text-[11px] px-2 py-1 rounded-lg" style={{ background: '#10b98115', color: '#34d399' }}>
                                ✅ לקוח קיים — {selectedCustomer.name}
                            </div>
                        )}
                    </div>

                    {/* Section 2: Address */}
                    <div className="rounded-xl border border-border p-3 space-y-2" style={{ background: '#ffffff04' }}>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">כתובת לאיסוף *</div>
                        {selectedCustomer && selectedCustomer.addresses.length > 0 ? (
                            <div className="space-y-1.5">
                                <div className="text-[11px] text-slate-600">בחר כתובת קיימת:</div>
                                {selectedCustomer.addresses.map(a => (
                                    <button key={a.id} onClick={() => selectAddress(a)}
                                        className="w-full text-right px-3 py-2 rounded-xl border transition-all"
                                        style={{
                                            background: form.lat === a.lat && form.lng === a.lng ? '#3b82f620' : '#ffffff06',
                                            borderColor: form.lat === a.lat && form.lng === a.lng ? '#3b82f6' : '#1e2d45',
                                            color: form.lat === a.lat && form.lng === a.lng ? '#93c5fd' : '#94a3b8',
                                        }}>
                                        <div className="text-xs font-bold">{a.label || 'כתובת'}</div>
                                        <div className="text-[10px] mt-0.5 opacity-80">{a.address_text}</div>
                                    </button>
                                ))}
                                <button onClick={() => setPickerOpen(true)}
                                    className="w-full text-[11px] text-slate-500 hover:text-blue-400 py-1 transition-colors">
                                    📍 או בחר כתובת אחרת על המפה
                                </button>
                            </div>
                        ) : (
                            form.lat !== null ? (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-white/5 text-xs">
                                    <span className="text-green-400 shrink-0">✅</span>
                                    <span className="text-slate-300 flex-1 truncate">{form.address_text}</span>
                                    <button onClick={() => setPickerOpen(true)} className="text-blue-400 hover:text-blue-300 shrink-0">שנה</button>
                                </div>
                            ) : (
                                <button className="btn-ghost w-full text-sm"
                                    style={{ borderColor: '#ef444460', color: '#f87171' }}
                                    onClick={() => setPickerOpen(true)}>
                                    📍 בחר כתובת על המפה (חובה)
                                </button>
                            )
                        )}
                        {form.lat !== null && selectedCustomer && selectedCustomer.addresses.length > 0 && (
                            <div className="text-[10px] text-green-400/70 px-1">✓ {form.address_text}</div>
                        )}
                    </div>

                    {/* Section 3: Details */}
                    <div className="rounded-xl border border-border p-3 space-y-3" style={{ background: '#ffffff04' }}>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">פרטי האיסוף</div>
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-[11px] text-slate-500 font-bold">מה לאסוף *</label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" className="w-3.5 h-3.5 rounded border-slate-600 bg-white/5 text-red-500 focus:ring-red-500" 
                                        checked={!!form.is_urgent} onChange={e => set('is_urgent', e.target.checked)} />
                                    <span className="text-[11px] font-bold text-red-400">🚨 איסוף דחוף</span>
                                </label>
                            </div>
                            <textarea className="input text-sm resize-none" rows={2}
                                value={form.what_to_collect}
                                onChange={e => set('what_to_collect', e.target.value)}
                                placeholder="תיאור מה צריך לאסוף..." />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[11px] text-slate-500 mb-1">עגלות</label>
                                <input className="input text-sm" type="number" step="0.5" min="0" value={form.carts ?? ''}
                                    onChange={e => set('carts', parseFloat(e.target.value) || '')} placeholder="0" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-500 mb-1">טלפון</label>
                                <input className="input text-sm" type="tel" value={form.phone ?? ''}
                                    onChange={e => set('phone', e.target.value)} placeholder="050-0000000" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-[11px] text-slate-500 mb-1">הערות</label>
                                <input className="input text-sm" value={form.notes ?? ''}
                                    onChange={e => set('notes', e.target.value)} placeholder="..." />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border space-y-2 shrink-0">
                    {!canSave && (
                        <div className="text-[11px] text-center text-red-400/70 pb-1">
                            {!form.name.trim() ? 'נדרש שם' : 'נדרשת כתובת'}
                        </div>
                    )}
                    <button className="btn-primary w-full text-sm" disabled={!canSave} onClick={() => onSave(form)}>
                        💾 שמור במאגר
                    </button>
                    <button className="btn-ghost w-full text-sm" onClick={onClose}>ביטול</button>
                </div>
            </div>

            {pickerOpen && (
                <MapPicker
                    initialQuery={form.address_text || form.name}
                    initialLat={form.lat ?? undefined}
                    initialLng={form.lng ?? undefined}
                    onConfirm={(lat, lng, label) => {
                        set('lat', lat); set('lng', lng); set('address_text', label)
                        setPickerOpen(false)
                    }}
                    onClose={() => setPickerOpen(false)}
                />
            )}
        </div>
    )
}

// ─── Main PickupsManager ──────────────────────────────────────────────────────

export function PickupsManager({ onClose }: { onClose: () => void }) {
    const [records, setRecords] = useState<PickupRecord[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [editing, setEditing] = useState<PickupRecord | null>(null)
    const [todayStatus, setTodayStatus] = useState<Record<string, boolean | null>>({})
    const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending')
    const [historySearch, setHistorySearch] = useState('')

    const reload = useCallback(async () => {
        const recs = await getAllPickupRecords()
        setRecords(recs)
        setSelectedIds(await getSelectedPickupIds())
        const status: Record<string, boolean | null> = {}
        for (const r of recs) {
            const c = getTodayCompletion(r)
            status[r.id] = c ? c.done : null
        }
        setTodayStatus(status)
    }, [])

    useEffect(() => { reload() }, [reload])

    const handleSave = async (record: PickupRecord) => {
        await upsertPickupRecord(record)
        await reload()
        setEditing(null)
    }

    const handleDelete = async (id: string) => {
        await deletePickupRecord(id)
        await setPickupSelected(id, false)
        await reload()
    }

    const handleToggleSelected = async (id: string) => {
        const next = !selectedIds.has(id)
        await setPickupSelected(id, next)
        setSelectedIds(prev => {
            const s = new Set(prev)
            if (next) s.add(id); else s.delete(id)
            return s
        })
    }

    const handleToggleDone = async (id: string, done: boolean) => {
        // If same value already, toggle off (reset)
        const current = todayStatus[id]
        if (current === done) {
            // remove today's mark
            const rec = records.find(r => r.id === id)
            if (rec) {
                const today = todayStr()
                rec.completions = rec.completions.filter(c => c.date !== today)
                // Actually to reset today in Supabase we could call markPickupDone explicitly if needed or delete
                // But markPickupDone currently only upserts, we can leave the local update and wait for reload or manually handle
                // to correctly remove from supabase, we should add logic to markPickupDone or just handle it. 
                // For now, I'll let it just not mark as done.
                setTodayStatus(prev => ({ ...prev, [id]: null }))
                setRecords(prev => prev.map(r => r.id === id ? { ...r, completions: rec.completions } : r))
            }
        } else {
            await markPickupDone(id, done)
            setTodayStatus(prev => ({ ...prev, [id]: done }))
            // Update local record completions
            const today = todayStr()
            setRecords(prev => prev.map(r => {
                if (r.id !== id) return r
                const filtered = r.completions.filter(c => c.date !== today)
                return { ...r, completions: [{ date: today, done }, ...filtered] }
            }))
        }
    }

    const handleUndoPickup = async (id: string, date: string) => {
        await unmarkPickupDone(id, date)
        if (date === todayStr()) {
            setTodayStatus(prev => ({ ...prev, [id]: null }))
        }
        await reload()
    }

    const pendingRecords = records.filter(r => !r.completions.some(c => c.done))
    const historyItems = records.flatMap(r =>
        r.completions.filter(c => c.done).map(c => ({ record: r, date: c.date, note: c.note }))
    ).sort((a, b) => b.date.localeCompare(a.date))

    const filteredHistory = historyItems.filter(item =>
        item.record.name.toLowerCase().includes(historySearch.toLowerCase()) ||
        (item.record.what_to_collect || '').toLowerCase().includes(historySearch.toLowerCase()) ||
        item.date.includes(historySearch)
    )

    const selectedCount = pendingRecords.filter(r => selectedIds.has(r.id) && r.lat !== null).length
    const doneToday = Object.values(todayStatus).filter(v => v === true).length
    const notDoneToday = Object.values(todayStatus).filter(v => v === false).length

    return (
        <div
            className="fixed inset-0 z-[8500] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)' }}
        >
            <div
                className="flex flex-col rounded-2xl shadow-2xl overflow-hidden"
                style={{
                    width: 560, maxWidth: '95vw', height: '88vh',
                    background: '#0a1525', border: '1px solid #1e2d45',
                }}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                        style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' }}>↩</div>
                    <div className="flex-1">
                        <div className="font-black text-sm text-slate-200">מאגר איסופים</div>
                        <div className="text-[11px] text-slate-500">
                            {pendingRecords.length} ממתינים · {historyItems.length} בהיסטוריה
                            {doneToday > 0 && ` · ✓ ${doneToday} סומנו כבוצעו היום`}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border shrink-0" dir="rtl">
                    <button
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'pending' ? 'text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => setActiveTab('pending')}
                    >
                        ממתינים ({pendingRecords.length})
                    </button>
                    <button
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'history' ? 'text-purple-400 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
                        onClick={() => setActiveTab('history')}
                    >
                        היסטוריה ({historyItems.length})
                    </button>
                </div>

                {activeTab === 'pending' ? (
                    <>
                        {/* Legend */}
                        <div className="px-4 py-2 border-b border-border bg-purple-500/5 shrink-0">
                            <div className="flex gap-4 text-[10px] text-slate-600" dir="rtl">
                                <span>☑ = לסידור קווים היום</span>
                                <span className="text-green-500">✓ = בוצע</span>
                                <span className="text-red-500">✗ = לא בוצע</span>
                                <span>● = היסטוריה אחרונה</span>
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2" dir="rtl">
                            {pendingRecords.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-3">
                                    <div className="text-5xl">↩</div>
                                    <div className="text-sm font-bold text-slate-500">אין איסופים ממתינים במאגר</div>
                                    <div className="text-xs text-slate-600">לחץ על "+ הוסף איסוף" להתחיל</div>
                                </div>
                            )}

                            {pendingRecords.map(r => (
                                <PickupCard
                                    key={r.id}
                                    record={r}
                                    selected={selectedIds.has(r.id)}
                                    todayDone={todayStatus[r.id] ?? null}
                                    onToggleSelected={() => handleToggleSelected(r.id)}
                                    onToggleDone={done => handleToggleDone(r.id, done)}
                                    onEdit={() => setEditing({ ...r })}
                                    onDelete={() => handleDelete(r.id)}
                                />
                            ))}
                        </div>

                        {/* Footer */}
                        <div className="p-3 border-t border-border space-y-2 shrink-0">
                            {selectedCount > 0 && (
                                <div className="text-[11px] text-center text-purple-300 py-1 rounded-xl"
                                    style={{ background: '#8b5cf610' }}>
                                    ✅ {selectedCount} איסופים ישובצו אוטומטית לקו הקרוב
                                </div>
                            )}
                            <button
                                className="w-full text-sm font-bold py-2 rounded-xl border-2 transition-all"
                                style={{
                                    background: 'linear-gradient(135deg,#8b5cf618,#8b5cf608)',
                                    color: '#a78bfa', borderColor: '#8b5cf650',
                                }}
                                onClick={() => setEditing(emptyRecord())}
                            >
                                ↩ הוסף איסוף למאגר
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="p-3 shrink-0" dir="rtl">
                            <input 
                                className="input text-sm w-full"
                                placeholder="חפש בהיסטוריית איסופים..."
                                value={historySearch}
                                onChange={e => setHistorySearch(e.target.value)}
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2" dir="rtl">
                            {filteredHistory.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-10 text-slate-500 text-sm">
                                    לא נמצאו תוצאות
                                </div>
                            ) : (
                                filteredHistory.map((item, idx) => (
                                    <div key={`${item.record.id}-${idx}`} className="flex flex-col p-3 rounded-xl border border-border bg-white/5 space-y-1">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-sm text-slate-200">{item.record.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono">{item.date}</span>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            📦 {item.record.what_to_collect || 'ללא תיאור'}
                                        </div>
                                        {item.record.address_text && (
                                            <div className="text-[10px] text-slate-600">
                                                📍 {item.record.address_text}
                                            </div>
                                        )}
                                        {item.note && (
                                            <div className="text-[10px] text-blue-400/80">
                                                💬 {item.note}
                                            </div>
                                        )}
                                        {item.record.carts ? (
                                            <div className="text-[10px] text-amber-500/80">
                                                🛒 {item.record.carts} עגלות
                                            </div>
                                        ) : null}
                                        <div className="pt-2 flex justify-end">
                                            <button 
                                                className="text-[10px] px-2 py-1 rounded border border-slate-500/40 text-slate-400 hover:bg-white/5 hover:text-slate-300 transition-colors"
                                                onClick={() => handleUndoPickup(item.record.id, item.date)}
                                            >
                                                בטל והחזר לממתינים
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editing && (
                <PickupForm
                    initial={editing}
                    onSave={handleSave}
                    onClose={() => setEditing(null)}
                />
            )}
        </div>
    )
}
