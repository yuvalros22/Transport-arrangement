'use client'
import { useState, useEffect, useRef } from 'react'
import type { ReviewEntry, CustomerAddress, Stop } from '@/types'
import { findCustomer } from '@/lib/customerDb'
import {
    getManualEntries, upsertManualEntry, removeManualEntry,
    getEntryOverrides, setEntryOverride,
    cancelEntry, restoreEntry, getCancelledCodes,
} from '@/lib/sessionStore'
import { MapPicker } from './MapPicker'

// ─── helpers ─────────────────────────────────────────────────────────────────

interface ParsedRow {
    code: string; name: string; carts: number | string
    trays?: number | string; carriers?: number | string; boxes?: number | string; packages_h?: number | string
    cart_number?: string
    time_from: string; time_to: string; notes: string; address: string
}

async function buildEntries(rows: ParsedRow[]): Promise<ReviewEntry[]> {
    const overrides = await getEntryOverrides()
    const cancelled = await getCancelledCodes()
    
    return Promise.all(rows.map(async row => {
        const match = await findCustomer(row.code, row.name)
        const customer = match?.customer ?? null
        const dbCode = customer?.code ?? row.code
        const override = overrides[row.code] || overrides[dbCode] || overrides[row.name]

        let lat: number | null = null
        let lng: number | null = null
        let address_text = row.address
        let address_label = ''
        let availableAddresses: CustomerAddress[] = []

        if (override) {
            lat = override.lat; lng = override.lng
            address_text = override.address_text
            address_label = '(עדכון יומי)'
        } else if (customer && customer.addresses.length > 0) {
            const first = customer.addresses[0]
            lat = first.lat; lng = first.lng
            address_text = first.address_text
            address_label = first.label
            availableAddresses = customer.addresses
        }

        return {
            code: dbCode,
            name: row.name,
            carts: row.carts,
            trays: row.trays,
            carriers: row.carriers,
            boxes: row.boxes,
            packages_h: row.packages_h,
            cart_number: row.cart_number,
            time_from: override?.time_from || row.time_from || customer?.time_from || '',
            time_to: override?.time_to || row.time_to || customer?.time_to || '',
            notes: override?.notes || row.notes || customer?.notes || '',
            lat, lng, address_text, address_label,
            isKnown: !!customer,
            needsAddress: lat === null,
            isManual: false,
            isCancelled: cancelled.has(dbCode),
            availableAddresses,
        }
    }))
}


function entryToStop(e: ReviewEntry): Stop {
    return {
        name: e.name,
        address: e.address_text,
        carts: e.carts,
        trays: e.trays,
        carriers: e.carriers,
        boxes: e.boxes,
        packages_h: e.packages_h,
        cart_number: e.cart_number,
        time_from: e.time_from,
        time_to: e.time_to,
        notes: e.notes,
        lat: e.lat,
        lng: e.lng,
    }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimeTag({ label, val }: { label: string; val: string }) {
    if (!val) return null
    return (
        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
            {label} {val}
        </span>
    )
}

function ManualEntryModal({ onClose, onSave }: { onClose: () => void, onSave: (data: Partial<ReviewEntry>) => void }) {
    const [data, setData] = useState<Partial<ReviewEntry>>({
        name: '', carts: 0, time_from: '', time_to: '', notes: '',
        trays: '', carriers: '', boxes: '', packages_h: '', cart_number: ''
    })

    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 dir-rtl" dir="rtl">
            <div className="bg-[#0f1d30] border border-[#1e2d45] rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
                <div className="px-5 py-4 border-b border-[#1e2d45] flex justify-between items-center bg-[#0a1525]">
                    <h2 className="font-black text-lg text-slate-200 flex items-center gap-2">
                        <span>➕</span> הוספת מסירה ידנית
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
                </div>
                
                <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
                    <div>
                        <label className="text-xs text-slate-400 block mb-1.5 font-semibold">שם הלקוח / יעד *</label>
                        <input autoFocus value={data.name} onChange={e => setData(p => ({ ...p, name: e.target.value }))}
                            className="input w-full" placeholder="הכנס שם..." />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">מס' עגלה (סידורי)</label>
                            <input value={data.cart_number || ''} onChange={e => setData(p => ({ ...p, cart_number: e.target.value }))}
                                className="input w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">עגלות לחלוקה</label>
                            <input type="number" min={0} max={18} value={data.carts || 0} onChange={e => setData(p => ({ ...p, carts: parseInt(e.target.value) || 0 }))}
                                className="input w-full text-center" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">מגשים</label>
                            <input value={data.trays || ''} onChange={e => setData(p => ({ ...p, trays: e.target.value }))} className="input w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">מנשאים</label>
                            <input value={data.carriers || ''} onChange={e => setData(p => ({ ...p, carriers: e.target.value }))} className="input w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">ארגזים</label>
                            <input value={data.boxes || ''} onChange={e => setData(p => ({ ...p, boxes: e.target.value }))} className="input w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">חומר ריבוי</label>
                            <input value={data.packages_h || ''} onChange={e => setData(p => ({ ...p, packages_h: e.target.value }))} className="input w-full" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">החל משעה</label>
                            <input type="time" value={data.time_from || ''} onChange={e => setData(p => ({ ...p, time_from: e.target.value }))} className="input w-full" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 block mb-1.5 font-semibold">עד שעה</label>
                            <input type="time" value={data.time_to || ''} onChange={e => setData(p => ({ ...p, time_to: e.target.value }))} className="input w-full" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-slate-400 block mb-1.5 font-semibold">הערות</label>
                        <input value={data.notes || ''} onChange={e => setData(p => ({ ...p, notes: e.target.value }))}
                            className="input w-full" placeholder="הערות חשובות לנהג..." />
                    </div>
                </div>

                <div className="p-4 border-t border-[#1e2d45] flex gap-3 bg-[#0a1525]">
                    <button className="btn-ghost flex-1" onClick={onClose}>ביטול</button>
                    <button 
                        className="btn-primary flex-1 disabled:opacity-50" 
                        disabled={!data.name}
                        onClick={() => {
                            if (data.name) onSave(data)
                        }}
                    >
                        שמור נקודה
                    </button>
                </div>
            </div>
        </div>
    )
}

interface EntryCardProps {
    entry: ReviewEntry
    onPickAddress: (entry: ReviewEntry) => void
    onSelectAddress: (entry: ReviewEntry, addr: CustomerAddress) => void
    onRemove?: () => void
    onFieldChange: (field: keyof ReviewEntry, val: any) => void
}

function EntryCard({ entry, onPickAddress, onSelectAddress, onRemove, onFieldChange }: EntryCardProps) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div
            className="rounded-xl border transition-all"
            style={{
                borderColor: entry.needsAddress ? '#ef4444' : entry.isKnown ? '#1e2d45' : '#f59e0b60',
                background: entry.needsAddress ? 'rgba(239,68,68,.04)' : '#0f1d30',
            }}
        >
            {/* Main row */}
            <div className="flex items-center gap-3 px-3 py-2.5">
                <div
                    className={`rounded-full shrink-0 flex items-center justify-center font-black ${entry.cart_number ? 'w-6 h-6 text-[10px] text-white border border-white/20' : 'w-2.5 h-2.5'}`}
                    style={{ background: entry.needsAddress ? '#ef4444' : entry.isManual ? '#f59e0b' : '#10b981' }}
                >
                    {entry.cart_number || ''}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-200 truncate">{entry.name || '—'}</span>
                        {entry.isManual && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">ידני</span>
                        )}
                        {!entry.isKnown && !entry.isManual && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700/50 text-slate-500 border border-slate-600/30 shrink-0">חדש</span>
                        )}
                    </div>
                    {entry.needsAddress ? (
                        <div className="text-[11px] text-red-400 mt-0.5">⚠️ נדרשת כתובת</div>
                    ) : (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5" title={entry.address_text}>
                            📍 {entry.address_text}
                            {entry.address_label && <span className="text-slate-600 mr-1">· {entry.address_label}</span>}
                        </div>
                    )}
                </div>
                <span className="text-[11px] text-amber-300 font-bold shrink-0">🛒 {entry.carts}</span>
                <button
                    onClick={() => onPickAddress(entry)}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
                    style={{
                        background: entry.needsAddress ? '#ef444420' : '#ffffff08',
                        color: entry.needsAddress ? '#f87171' : '#64748b',
                        border: `1px solid ${entry.needsAddress ? '#ef444440' : '#1e2d45'}`,
                    }}
                >
                    {entry.needsAddress ? '+ כתובת' : '✏️'}
                </button>
                <button onClick={() => setExpanded(p => !p)} className="text-slate-600 hover:text-slate-400 text-xs px-1">
                    {expanded ? '▲' : '▼'}
                </button>
                {onRemove && (
                    <button onClick={onRemove} className="text-slate-700 hover:text-red-400 text-xs">✕</button>
                )}
            </div>

            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2">
                    {/* Multi-address selector */}
                    {entry.availableAddresses.length > 1 && (
                        <div>
                            <div className="text-[10px] text-slate-600 mb-1">בחר כתובת:</div>
                            <div className="flex flex-wrap gap-1.5">
                                {entry.availableAddresses.map(addr => (
                                    <button
                                        key={addr.id}
                                        onClick={() => onSelectAddress(entry, addr)}
                                        className="text-[10px] px-2 py-1 rounded-lg border transition-all"
                                        style={{
                                            background: entry.lat === addr.lat ? '#3b82f620' : 'transparent',
                                            borderColor: entry.lat === addr.lat ? '#3b82f6' : '#1e2d45',
                                            color: entry.lat === addr.lat ? '#93c5fd' : '#64748b',
                                        }}
                                    >
                                        {addr.label || addr.address_text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Manual name field */}
                    {entry.isManual && (
                        <div>
                            <label className="text-[10px] text-slate-600 block mb-1">שם לקוח</label>
                            <input value={entry.name} onChange={e => onFieldChange('name', e.target.value)}
                                className="input py-1 text-xs" dir="rtl" placeholder="שם..." />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-600 block mb-1">עגלות</label>
                            <input type="number" min={0} max={18} value={entry.carts}
                                onChange={e => onFieldChange('carts', parseInt(e.target.value) || 0)}
                                className="input py-1 text-xs text-center" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-600 block mb-1">הערות</label>
                            <input value={entry.notes} onChange={e => onFieldChange('notes', e.target.value)}
                                className="input py-1 text-xs" dir="rtl" placeholder="..." />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-600 block mb-1">⏰ החל משעה</label>
                            <input type="time" value={entry.time_from} onChange={e => onFieldChange('time_from', e.target.value)}
                                className="input py-1 text-xs" />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-600 block mb-1">⏰ עד שעה</label>
                            <input type="time" value={entry.time_to} onChange={e => onFieldChange('time_to', e.target.value)}
                                className="input py-1 text-xs" />
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <TimeTag label="מ-" val={entry.time_from} />
                        <TimeTag label="עד" val={entry.time_to} />
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Preview map ──────────────────────────────────────────────────────────────
function PreviewMap({ entries, onPickAddress }: {
    entries: ReviewEntry[]
    onPickAddress: (e: ReviewEntry) => void
}) {
    const divRef = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const markersRef = useRef<any[]>([])
    const [mapReady, setMapReady] = useState(false)

    useEffect(() => {
        if (!divRef.current || mapRef.current) return
        let cancelled = false
        const boot = async () => {
            if (!window.L) {
                await new Promise<void>(res => {
                    if (document.querySelector('script[src*="leaflet"]')) { res(); return }
                    const link = document.createElement('link'); link.rel = 'stylesheet'
                    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
                    document.head.appendChild(link)
                    const script = document.createElement('script')
                    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
                    script.onload = () => res(); document.head.appendChild(script)
                })
            }
            if (cancelled || !divRef.current) return
            const L = window.L
            const map = L.map(divRef.current, { center: [32.38639, 34.92667], zoom: 8 })
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © Carto', maxZoom: 19,
            }).addTo(map)
            L.marker([32.38639, 34.92667], {
                icon: L.divIcon({
                    html: `<div style="width:28px;height:28px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #f59e0b">🏠</div>`,
                    iconSize: [28, 28], iconAnchor: [14, 14], className: '',
                }),
            }).addTo(map)
            mapRef.current = map
            if (!cancelled) setMapReady(true)
        }
        boot()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!mapReady || !mapRef.current) return
        const L = window.L; const map = mapRef.current
        markersRef.current.forEach(m => map.removeLayer(m))
        markersRef.current = []
        const bounds: [number, number][] = [[32.38639, 34.92667]]
        entries.forEach(e => {
            if (!e.lat || !e.lng) return
            const icon = L.divIcon({
                html: `<div style="width:22px;height:22px;border-radius:50%;background:${e.needsAddress ? '#ef4444' : '#10b981'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#fff;border:2px solid rgba(255,255,255,.7);font-family:Heebo,sans-serif;cursor:pointer">${e.carts || '?'}</div>`,
                iconSize: [22, 22], iconAnchor: [11, 11], className: '',
            })
            const marker = L.marker([e.lat, e.lng], { icon }).addTo(map)
            marker.bindPopup(`<div style="font-family:Heebo,sans-serif;direction:rtl;padding:4px"><b>${e.name}</b><br><span style="font-size:11px;color:#94a3b8">${e.address_text}</span></div>`)
            marker.on('click', () => onPickAddress(e))
            markersRef.current.push(marker)
            bounds.push([e.lat, e.lng])
        })
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
    }, [entries, mapReady])

    return <div ref={divRef} className="w-full h-full" />
}

// ─── Main ReviewScreen ────────────────────────────────────────────────────────

interface Props {
    rows: ParsedRow[]
    onCancel: () => void
    /** Called with array of resolved Stop objects + truck count */
    onBuildRoutes: (stops: Stop[], numTrucks: number) => void
    numTrucks: number
    setNumTrucks: (n: number) => void
}

export function ReviewScreen({ rows, onCancel, onBuildRoutes, numTrucks, setNumTrucks }: Props) {
    const [entries, setEntries] = useState<ReviewEntry[]>([])
    const [pickerFor, setPickerFor] = useState<ReviewEntry | null>(null)
    const [showManualModal, setShowManualModal] = useState(false)
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const boot = async () => {
            const base = await buildEntries(rows)
            const manual = await getManualEntries()
            const cancelled = await getCancelledCodes()
            const manualMapped: ReviewEntry[] = manual
                .filter(m => !base.find(b => b.code === m.code))
                .map(m => ({ ...m, isCancelled: cancelled.has(m.code) }))
            setEntries([...base, ...manualMapped])
        }
        boot()
    }, [rows])

    const updateByCode = (code: string, patch: Partial<ReviewEntry>) =>
        setEntries(prev => prev.map(e => e.code === code ? { ...e, ...patch } : e))

    const handleSelectAddress = async (entry: ReviewEntry, addr: CustomerAddress) => {
        await setEntryOverride(entry.code, { lat: addr.lat, lng: addr.lng, address_text: addr.address_text })
        updateByCode(entry.code, {
            lat: addr.lat, lng: addr.lng,
            address_text: addr.address_text, address_label: addr.label,
            needsAddress: false,
        })
    }

    const handleConfirmPicker = async (lat: number, lng: number, label: string) => {
        if (!pickerFor) return
        const code = pickerFor.code

        // Save to daily session under the row's unique code
        await setEntryOverride(code, { lat, lng, address_text: label })

        // Update local state (only this specific row)
        updateByCode(code, { lat, lng, address_text: label, needsAddress: false })

        // If manual entry, also persist full entry to session
        if (pickerFor.isManual) {
            const updated = entries.find(e => e.code === code) || pickerFor
            await upsertManualEntry({ ...updated, lat, lng, address_text: label, needsAddress: false })
        }

        setPickerFor(null)

        // Scroll to the ready section after state updates
        setTimeout(() => {
            const readyEl = listRef.current?.querySelector('[data-section="ready"]')
            readyEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
    }

    const handleSaveManual = async (data: Partial<ReviewEntry>) => {
        const code = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
        const entry: ReviewEntry = {
            code,
            name: data.name || '',
            carts: data.carts || 0,
            trays: data.trays || '',
            carriers: data.carriers || '',
            boxes: data.boxes || '',
            packages_h: data.packages_h || '',
            cart_number: data.cart_number || '',
            time_from: data.time_from || '',
            time_to: data.time_to || '',
            notes: data.notes || '',
            lat: null, lng: null, address_text: '', address_label: '',
            isKnown: false, needsAddress: true, isManual: true, availableAddresses: [],
        }
        await upsertManualEntry(entry)
        setEntries(prev => [...prev, entry])
        setShowManualModal(false)
        setPickerFor(entry) // immediately open map picker for address
    }

    const handleRemoveManual = async (code: string) => {
        await removeManualEntry(code)
        setEntries(prev => prev.filter(e => e.code !== code))
    }

    // Works for ALL entries (Excel + manual) — flips isCancelled flag
    const handleRemoveEntry = async (entry: ReviewEntry) => {
        await cancelEntry(entry.code)
        if (entry.isManual) await removeManualEntry(entry.code)
        setEntries(prev => prev.map(e =>
            e.code === entry.code ? { ...e, isCancelled: true } : e
        ))
    }

    const handleRestoreEntry = async (entry: ReviewEntry) => {
        await restoreEntry(entry.code)
        setEntries(prev => prev.map(e =>
            e.code === entry.code ? { ...e, isCancelled: false } : e
        ))
    }

    const handleFieldChange = async (code: string, field: keyof ReviewEntry, val: any) => {
        setEntries(prev => prev.map(e => e.code === code ? { ...e, [field]: val } : e))
        
        if (['time_from', 'time_to', 'carts', 'notes'].includes(field as string)) {
            await setEntryOverride(code, { [field]: val })
        }
        
        const updated = entries.find(e => e.code === code)
        if (updated?.isManual) {
            await upsertManualEntry({ ...updated, [field]: val })
        }
    }

    const handleBuild = () => {
        const stops = entries.filter(e => !e.needsAddress && !e.isCancelled).map(entryToStop)
        onBuildRoutes(stops, numTrucks)
    }

    // Derive three lists from single source
    const missingAddress = entries.filter(e => !e.isCancelled && e.needsAddress)
    const withAddress = entries.filter(e => !e.isCancelled && !e.needsAddress)
    const cancelledList = entries.filter(e => e.isCancelled)
    const activeCount = withAddress.length + missingAddress.length

    return (
        <div className="flex flex-col h-screen overflow-hidden" dir="rtl">
            {/* Header */}
            <header className="flex items-center gap-4 px-6 py-3 bg-surface border-b border-border shrink-0">
                <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-lg">🚛</div>
                <div>
                    <h1 className="font-black text-base tracking-tight">בדיקת לקוחות ושיוך כתובות</h1>
                    <p className="text-xs text-slate-500">{withAddress.length} מוכנים · {missingAddress.length} ממתינים לכתובת</p>
                </div>
                <div className="flex gap-2 mr-auto items-center flex-wrap">
                    {[
                        [`👥 ${entries.length}`, '#3b82f6'],
                        [`✅ ${withAddress.length}`, '#10b981'],
                        ...(missingAddress.length > 0 ? [[`⚠️ ${missingAddress.length}`, '#ef4444']] : []),
                    ].map(([txt, col]) => (
                        <span key={txt} className="text-xs font-bold px-3 py-1 rounded-full border"
                            style={{ color: col as string, borderColor: (col as string) + '40', background: (col as string) + '12' }}>
                            {txt}
                        </span>
                    ))}
                </div>
            </header>

            {/* Body: list + map */}
            <div className="flex flex-1 overflow-hidden">
                {/* ── List panel ── */}
                <div className="w-[420px] shrink-0 flex flex-col bg-surface border-l border-border overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-3 space-y-2" ref={listRef}>
                        {missingAddress.length > 0 && (
                            <div>
                                <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider px-1 mb-1.5">
                                    ⚠️ חסרה כתובת ({missingAddress.length})
                                </div>
                                {missingAddress.map(entry => (
                                    <EntryCard key={entry.code} entry={entry}
                                        onPickAddress={e => setPickerFor(e)}
                                        onSelectAddress={handleSelectAddress}
                                        onRemove={() => handleRemoveEntry(entry)}
                                        onFieldChange={(f, v) => handleFieldChange(entry.code, f, v)} />
                                ))}
                            </div>
                        )}

                        {withAddress.length > 0 && (
                            <div data-section="ready">
                                <div className="text-[10px] font-bold text-green-400 uppercase tracking-wider px-1 mb-1.5 mt-2">
                                    ✅ מוכן למסלול ({withAddress.length})
                                </div>
                                {withAddress.map(entry => (
                                    <EntryCard key={entry.code} entry={entry}
                                        onPickAddress={e => setPickerFor(e)}
                                        onSelectAddress={handleSelectAddress}
                                        onRemove={() => handleRemoveEntry(entry)}
                                        onFieldChange={(f, v) => handleFieldChange(entry.code, f, v)} />
                                ))}
                            </div>
                        )}

                        {/* ── Cancelled today ── */}
                        {cancelledList.length > 0 && (
                            <div className="mt-2">
                                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-1 mb-1.5">
                                    🚫 בוטלו היום ({cancelledList.length})
                                </div>
                                {cancelledList.map(e => (
                                    <div key={e.code}
                                        className="flex items-center gap-2 px-3 py-2 rounded-xl border mb-1"
                                        style={{ borderColor: '#1e2d4580', background: '#0a1525', opacity: 0.7 }}
                                    >
                                        <span className="text-slate-600 text-sm">🚫</span>
                                        <span className="flex-1 text-xs text-slate-600 truncate line-through">{e.name}</span>
                                        <button
                                            onClick={() => handleRestoreEntry(e)}
                                            className="text-[11px] text-blue-500 hover:text-blue-300 shrink-0 transition-colors"
                                        >
                                            ↩ שחזר
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>

                    {/* Footer */}
                    <div className="p-3 border-t border-border space-y-2">
                        <button className="btn-ghost w-full text-sm" onClick={() => setShowManualModal(true)}>
                            ➕ הוסף נקודה ידנית
                        </button>

                        <div className="flex gap-3 items-center">
                            <label className="text-xs text-slate-500 shrink-0">משאיות:</label>
                            <input type="number" min={1} max={20} value={numTrucks}
                                onChange={e => setNumTrucks(parseInt(e.target.value) || 1)}
                                className="input w-20 text-center text-lg font-black" />
                            <div className="text-[11px] text-slate-600 leading-tight flex-1">מספר משאיות זמינות היום</div>
                        </div>

                        <div className="flex gap-2">
                            <button className="btn-ghost flex-1 text-sm" onClick={onCancel}>← חזור</button>
                            <button
                                className="btn-primary flex-1 text-sm"
                                disabled={withAddress.length === 0}
                                onClick={handleBuild}
                                title={missingAddress.length > 0 ? 'חלק מהלקוחות חסרי כתובת ולא יכללו במסלול' : ''}
                            >
                                {missingAddress.length > 0
                                    ? `🚛 סדר קווים (${withAddress.length} לקוחות)`
                                    : '🚛 סדר קווים'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Preview map ── */}
                <div className="flex-1 relative overflow-hidden">
                    <PreviewMap entries={entries} onPickAddress={setPickerFor} />
                </div>
            </div>

            {/* Map picker modal */}
            {pickerFor && (
                <MapPicker
                    initialQuery={pickerFor.address_text || pickerFor.name}
                    initialLat={pickerFor.lat ?? undefined}
                    initialLng={pickerFor.lng ?? undefined}
                    onConfirm={handleConfirmPicker}
                    onClose={() => setPickerFor(null)}
                />
            )}

            {/* Manual entry creator modal */}
            {showManualModal && (
                <ManualEntryModal 
                    onClose={() => setShowManualModal(false)}
                    onSave={handleSaveManual}
                />
            )}
        </div>
    )
}
