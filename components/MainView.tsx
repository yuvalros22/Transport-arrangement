'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { RoutesResult, Route, RouteStop } from '@/types'
import { MapView } from './MapView'
import { ReviewScreen } from './ReviewScreen'
import { CustomerManager } from './CustomerManager'
import { PickupsManager } from './PickupsManager'
import { DriversManager } from './DriversManager'
import { getAllPickupRecords } from '@/lib/pickupDb'
import { getAllDrivers } from '@/lib/driverDb'
import type { Driver } from '@/types'
import { getSelectedPickupIdsArray, getRoutesResult, setRoutesResult, setEntryOverride, getOriginalRows, setOriginalRows } from '@/lib/sessionStore'
import { geocodeBatch } from '@/lib/geocode'
type DragSrc = { type: 'stop' | 'pickup' | 'route'; routeId: number; index: number }

// ─── Columns (board) view ─────────────────────────────────────────────────────
function ColumnsView({
  routes,
  onDragStart, onDragOver, onDrop, onDragEnd,
  dragSrc, dragOverInfo,
  allDrivers, onAssignDriver, onToggleNightRoute, onAddRoute, onDeleteRoute,
  onUpdateRouteName, onReorderRoute
}: {
  routes: Route[]
  dragSrc: DragSrc | null
  dragOverInfo: { type: 'stop' | 'pickup' | 'route'; routeId: number; index: number } | null
  onDragStart: (type: 'stop' | 'pickup' | 'route', routeId: number, index: number) => void
  onDragOver: (e: React.DragEvent, type: 'stop' | 'pickup' | 'route', routeId: number, index: number) => void
  onDrop: (type: 'stop' | 'pickup' | 'route', toRouteId: number, toIndex: number) => void
  onDragEnd: () => void
  allDrivers: Driver[]
  onAssignDriver: (routeId: number, driverId: string) => void
  onToggleNightRoute: (routeId: number, isNight: boolean) => void
  onAddRoute: () => void
  onDeleteRoute: (routeId: number) => void
  onUpdateRouteName: (routeId: number, name: string) => void
  onReorderRoute: (draggedRouteId: number, targetRouteId: number) => void
}) {
  const hasWarn = (s: RouteStop) =>
    s.notes && (s.notes.includes('חובה') || s.notes.includes('מזומן') || s.notes.includes('⚠'))

  return (
    <div className="flex gap-3 h-full overflow-x-auto overflow-y-hidden p-4" dir="rtl"
      style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e2d45 transparent' }}>
      {routes.map((route, routeIdx) => {
        const pct = Math.min(100, (route.total_carts / 18) * 100)
        const isDraggingOverStopOrPickup = dragSrc && dragSrc.type !== 'route' && dragOverInfo?.routeId === route.id
        const isDraggingOverRoute = dragSrc?.type === 'route' && dragOverInfo?.type === 'route' && dragOverInfo?.routeId === route.id
        const isBeingDragged = dragSrc?.type === 'route' && dragSrc?.routeId === route.id

        return (
          <div
            key={route.id}
            draggable
            onDragStart={e => { e.stopPropagation(); onDragStart('route', route.id, routeIdx) }}
            onDragOver={e => onDragOver(e, 'route', route.id, routeIdx)}
            onDrop={e => {
              e.preventDefault()
              e.stopPropagation()
              if (dragSrc?.type === 'stop') onDrop('stop', route.id, route.stops.length)
              else if (dragSrc?.type === 'pickup') onDrop('pickup', route.id, route.pickups.length)
              else if (dragSrc?.type === 'route') onReorderRoute(dragSrc.routeId, route.id)
            }}
            onDragEnd={onDragEnd}
            className="flex flex-col rounded-2xl overflow-hidden shrink-0 transition-all"
            style={{
              width: 'clamp(220px, 20vw, 280px)',
              background: '#0f1d30',
              border: `1.5px solid ${isDraggingOverStopOrPickup ? route.color : (isDraggingOverRoute ? '#4ade80' : '#1e2d45')}`,
              boxShadow: isDraggingOverStopOrPickup ? `0 0 20px ${route.color}30` : undefined,
              opacity: isBeingDragged ? 0.3 : 1,
              cursor: dragSrc?.type === 'route' ? 'grabbing' : 'auto'
            }}
          >
            {/* Column header */}
            <div className="shrink-0 px-3 pt-3 pb-2"
              style={{ background: route.color + '18', borderBottom: `1px solid ${route.color}30` }}>
              <div className="flex items-center gap-2 mb-1.5" style={{ cursor: 'grab' }}>
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: route.color }} />
                <input
                  type="text"
                  value={route.name}
                  onChange={e => onUpdateRouteName(route.id, e.target.value)}
                  className="font-black text-sm flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-1 focus:ring-white/20 rounded px-1 transition-all"
                  style={{ color: route.color }}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                />
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: route.color + '25', color: route.color }}>
                  {route.direction}
                </span>
                {route.stops.length === 0 && (!route.pickups || route.pickups.length === 0) && (
                  <button onClick={() => onDeleteRoute(route.id)} className="text-red-400/70 hover:text-red-400 transition-colors text-xs px-1" title="מחק קו ריק">✕</button>
                )}
              </div>
              {/* Capacity bar */}
              <div className="h-1 rounded-full bg-white/10 overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: route.color }} />
              </div>
              <div className="flex gap-2 text-[10px] font-semibold mb-2">
                <span style={{ color: route.color }}>🛒 {route.total_carts}/18</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{route.stops.length} עצירות</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-500">~{route.distance_km}ק"מ</span>
              </div>

              {/* Driver & Night Route Controls */}
              <div className="space-y-1.5 p-2 rounded-xl bg-black/20 border border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <select
                    className="input text-[11px] py-1 bg-transparent border-slate-700/50 w-full text-slate-200"
                    value={route.driver?.id || ''}
                    onChange={e => onAssignDriver(route.id, e.target.value)}
                  >
                    <option className="bg-[#0f1d30] text-slate-200" value="">👨‍✈️ שיבוץ נהג...</option>
                    {allDrivers.map(d => (
                      <option className="bg-[#0f1d30] text-slate-200" key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer w-max pl-1">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 rounded border-slate-600 bg-transparent text-purple-500 focus:ring-purple-500"
                    checked={!!route.isNightRoute}
                    onChange={e => onToggleNightRoute(route.id, e.target.checked)}
                  />
                  <span className="text-[10px] font-bold text-slate-300">🌙 קו לילה</span>
                </label>
              </div>
            </div>

            {/* Stops list — scrollable */}
            <div className="flex-1 overflow-y-auto"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e2d45 transparent' }}>
              {/* Start */}
              <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-600">
                <span>🏠</span><span>מושב חגלה — יציאה</span>
              </div>

              {route.stops.map((s, i) => {
                const isBeingDragged = dragSrc?.type === 'stop' && dragSrc?.routeId === route.id && dragSrc?.index === i
                const isDropTarget = dragOverInfo?.type === 'stop' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === i
                const warn = hasWarn(s)

                return (
                  <div key={i}>
                    {isDropTarget && (
                      <div className="h-0.5 mx-2 my-0.5 rounded-full"
                        style={{ background: route.color }} />
                    )}
                    <div
                      draggable
                      onDragStart={e => { e.stopPropagation(); onDragStart('stop', route.id, i) }}
                      onDragOver={e => onDragOver(e, 'stop', route.id, i)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop('stop', route.id, i) }}
                      onDragEnd={onDragEnd}
                      className="mx-2 mb-1 rounded-xl px-2.5 py-2 transition-all group"
                      style={{
                        background: isBeingDragged ? 'transparent' : warn ? 'rgba(239,68,68,.06)' : `${route.color}08`,
                        border: `1px solid ${isBeingDragged ? 'transparent' : warn ? 'rgba(239,68,68,.2)' : route.color + '20'}`,
                        opacity: isBeingDragged ? 0.3 : 1,
                        cursor: dragSrc ? 'grabbing' : 'grab',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {/* Order badge */}
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5"
                          style={{ background: route.color + '30', color: route.color }}>
                          {s.cart_number || ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[11px] truncate text-slate-200">{s.name}</div>
                          <div className="text-[10px] text-slate-500 truncate mt-0.5">{s.address}</div>
                          {/* Badges */}
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {Number(s.carts) > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-400/10 text-amber-300 font-semibold">
                                🛒 {s.carts}
                              </span>
                            )}
                            {s.time_window && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-blue-500/10 text-blue-300">
                                ⏰ {s.time_window}
                              </span>
                            )}
                            {warn && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-red-500/10 text-red-300">⚠️</span>
                            )}
                          </div>
                          {s.notes && (
                            <div className={`mt-1 text-[9px] leading-relaxed ${warn ? 'text-red-300/70' : 'text-slate-600'}`}>
                              {s.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Drop zone for cross-route drag */}
              {dragSrc && dragSrc.type === 'stop' && dragSrc.routeId !== route.id && (
                <div
                  className="mx-2 mb-1 h-8 rounded-xl border border-dashed flex items-center justify-center text-[10px] transition-all"
                  style={{
                    borderColor: isDraggingOverStopOrPickup ? route.color : '#1e2d45',
                    color: isDraggingOverStopOrPickup ? route.color : '#475569',
                  }}
                  onDragOver={e => onDragOver(e, 'stop', route.id, route.stops.length)}
                  onDrop={e => { e.preventDefault(); onDrop('stop', route.id, route.stops.length) }}
                >
                  + הוסף לסוף הקו
                </div>
              )}

              {/* End */}
              <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-600 border-t border-white/5 mt-1">
                <span>🏠</span><span>מושב חגלה — חזרה</span>
              </div>

              {/* ── Pickups for this route ── */}
              {(route.pickups?.length > 0 || (dragSrc && dragSrc.type === 'pickup')) && (
                <div className="border-t mt-1 pt-1 pb-2" style={{ borderColor: '#8b5cf620' }}>
                  {route.pickups?.length > 0 && (
                    <div className="px-3 py-1 text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: '#a78bfa' }}>
                      ↩ איסופים ({route.pickups.length})
                    </div>
                  )}
                  {(route.pickups || []).map((p, i) => {
                    const isBeingDragged = dragSrc?.type === 'pickup' && dragSrc?.routeId === route.id && dragSrc?.index === i
                    const isDropTarget = dragOverInfo?.type === 'pickup' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === i
                    return (
                      <div key={p.id}>
                        {isDropTarget && (
                          <div className="h-0.5 mx-2 my-0.5 rounded-full"
                            style={{ background: '#a78bfa' }} />
                        )}
                        <div
                          draggable
                          onDragStart={e => { e.stopPropagation(); onDragStart('pickup', route.id, i) }}
                          onDragOver={e => onDragOver(e, 'pickup', route.id, i)}
                          onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop('pickup', route.id, i) }}
                          onDragEnd={onDragEnd}
                          className="mx-2 mb-1 px-2.5 py-2 rounded-xl transition-all"
                          style={{
                            background: isBeingDragged ? 'transparent' : '#8b5cf610',
                            border: `1px solid ${isBeingDragged ? 'transparent' : '#8b5cf630'}`,
                            opacity: isBeingDragged ? 0.3 : 1,
                            cursor: dragSrc ? 'grabbing' : 'grab',
                          }}
                        >
                          <div className="flex items-start gap-1.5">
                            <span className="text-purple-400 text-sm shrink-0 mt-0.5">↩</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-[11px] text-purple-200 truncate">{p.name}</div>
                              <div className="text-[10px] text-purple-300/70 truncate">📦 {p.what_to_collect}</div>
                              <div className="text-[9px] text-slate-600 truncate mt-0.5">📍 {p.address_text}</div>
                              {p.phone && (
                                <div className="text-[9px] text-blue-400">📞 {p.phone}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {/* Drop zone for cross-route pickup drag */}
                  {dragSrc && dragSrc.type === 'pickup' && dragSrc.routeId !== route.id && (
                    <div
                      className="mx-2 mb-1 h-8 rounded-xl border border-dashed flex items-center justify-center text-[10px] transition-all"
                      style={{
                        borderColor: dragOverInfo?.type === 'pickup' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === route.pickups.length ? '#a78bfa' : '#1e2d45',
                        color: dragOverInfo?.type === 'pickup' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === route.pickups.length ? '#a78bfa' : '#475569',
                      }}
                      onDragOver={e => onDragOver(e, 'pickup', route.id, route.pickups.length)}
                      onDrop={e => { e.preventDefault(); onDrop('pickup', route.id, route.pickups.length) }}
                    >
                      + הוסף לסוף האיסופים
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
      
      {/* Add new route button */}
      <button
        onClick={onAddRoute}
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed shrink-0 transition-all hover:bg-white/5 active:scale-95"
        style={{
          width: 'clamp(220px, 20vw, 280px)',
          borderColor: '#1e2d45',
          color: '#475569'
        }}
      >
        <div className="text-3xl mb-2">➕</div>
        <div className="font-bold text-sm text-slate-400">הוסף קו חדש</div>
      </button>
    </div>
  )
}

// ─── Distance helper (mirrors lib/routing) ────────────────────────────────────
const HAGLA_PT = { lat: 32.38639, lng: 34.92667 }

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, p = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lng2 - lng1) * p / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}
function calcKm(stops: RouteStop[]) {
  const pts = [HAGLA_PT, ...stops.map(s => ({ lat: s.lat ?? HAGLA_PT.lat, lng: s.lng ?? HAGLA_PT.lng })), HAGLA_PT]
  let d = 0
  for (let i = 0; i < pts.length - 1; i++)
    d += haversine(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng)
  return Math.round(d * 10) / 10
}

// ─── Smart merge: keep existing layout, update quantities ─────────────────────
const MAX_CARTS_LIMIT = 18

function mergeIntoExistingRoutes(
  existing: RoutesResult,
  newStops: any[],
): { routes: Route[]; warnings: string[]; unassigned: any[] } {
  const routes: Route[] = existing.routes.map(r => ({
    ...r,
    stops: r.stops.map(s => ({ ...s })),
    pickups: [...r.pickups],
  }))
  const warnings: string[] = []
  const unassigned: any[] = []

  const matchedStops = new Set<string>()

  for (const ns of newStops) {
    const newName = ns.name.trim().toLowerCase()
    const newCartNum = String(ns.cart_number || '').trim()
    let foundRoute: Route | null = null
    let foundIndex = -1

    // Pass 1: Try to match by both name and cart_number
    if (newCartNum) {
      outer1: for (const route of routes) {
        for (let i = 0; i < route.stops.length; i++) {
          if (matchedStops.has(`${route.id}-${i}`)) continue
          if (route.stops[i].name.trim().toLowerCase() === newName &&
              String(route.stops[i].cart_number || '').trim() === newCartNum) {
            foundRoute = route
            foundIndex = i
            break outer1
          }
        }
      }
    }

    // Pass 2: Fallback to match by name only (for stops that didn't have a cart number before)
    if (!foundRoute) {
      outer2: for (const route of routes) {
        for (let i = 0; i < route.stops.length; i++) {
          if (matchedStops.has(`${route.id}-${i}`)) continue
          if (route.stops[i].name.trim().toLowerCase() === newName) {
            foundRoute = route
            foundIndex = i
            break outer2
          }
        }
      }
    }

    if (foundRoute && foundIndex !== -1) {
      matchedStops.add(`${foundRoute.id}-${foundIndex}`)
      const oldStop = foundRoute.stops[foundIndex]
      const merged_time_from = ns.time_from || oldStop.time_from || ''
      const merged_time_to = ns.time_to || oldStop.time_to || ''
      const tw = merged_time_from && merged_time_to ? `${merged_time_from}–${merged_time_to}`
        : merged_time_from ? `מ-${merged_time_from}` : merged_time_to ? `עד ${merged_time_to}` : ''

      foundRoute.stops[foundIndex] = {
        ...oldStop,
        carts: ns.carts ?? oldStop.carts,
        trays: ns.trays,
        carriers: ns.carriers,
        boxes: ns.boxes,
        packages_h: ns.packages_h,
        time_from: merged_time_from,
        time_to: merged_time_to,
        time_window: tw,
        notes: ns.notes !== undefined ? ns.notes : oldStop.notes,
        cart_number: ns.cart_number || oldStop.cart_number,
      }
    } else {
      if (ns.lat && ns.lng) {
        let bestRoute: Route | null = null
        let bestDist = Infinity
        for (const route of routes) {
          const used = route.stops.reduce((a, s) => a + Number(s.carts || 0), 0)
          if (used + Number(ns.carts || 0) > MAX_CARTS_LIMIT) continue
          for (const stop of route.stops) {
            if (!stop.lat || !stop.lng) continue
            const d = haversine(ns.lat, ns.lng, stop.lat, stop.lng)
            if (d < bestDist) { bestDist = d; bestRoute = route }
          }
        }
        if (bestRoute) {
          const tw = ns.time_from && ns.time_to ? `${ns.time_from}–${ns.time_to}`
            : ns.time_from ? `מ-${ns.time_from}` : ns.time_to ? `עד ${ns.time_to}` : ''
          bestRoute.stops.push({
            ...ns, address: ns.address || '',
            order: bestRoute.stops.length + 1, time_window: tw,
          } as RouteStop)
        } else {
          unassigned.push({ ...ns, _reason: 'אין קו עם קיבולת פנויה' })
        }
      } else {
        unassigned.push({ ...ns, _reason: 'חסרה כתובת' })
      }
    }
  }

  for (const route of routes) {
    const total = route.stops.reduce((a, s) => a + Number(s.carts || 0), 0)
    if (total > MAX_CARTS_LIMIT)
      warnings.push(`⚠️ ${route.name}: ${total} עגלות (חריגה ממגבלת ${MAX_CARTS_LIMIT})`)
    route.total_carts = total
    route.stops.forEach((s, i) => { s.order = i + 1 })
    route.distance_km = calcKm(route.stops)
  }
  return { routes, warnings, unassigned }
}

// ─── Drag state types ─────────────────────────────────────────────────────────

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onClick={() => !loading && ref.current?.click()}
      className={`
        relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer select-none
        ${drag ? 'border-amber-400 bg-amber-400/5' : 'border-border hover:border-slate-600'}
        ${loading ? 'cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={ref} type="file" accept=".xlsx,.xls"
        className="hidden"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="text-5xl animate-bounce">🗺️</div>
          <div className="font-bold text-slate-300 text-lg">ממיר כתובות ומחשב מסלולים...</div>
          <div className="text-sm text-slate-500">זה עלול לקחת כחצי דקה</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className={`text-6xl transition-transform ${drag ? 'scale-110' : ''}`}>📂</div>
          <div className="font-black text-xl text-slate-200">גרור קובץ אקסל לכאן</div>
          <div className="text-sm text-slate-500">או לחצי לבחירה &nbsp;·&nbsp; .xlsx / .xls</div>
          <div className="mt-2 text-xs text-slate-600 leading-relaxed">
            עמודות שהמערכת מזהה אוטומטית:<br />
            <span className="text-slate-500">שם לקוח · כתובת · עגלות · החל משעה · עד שעה · הערות</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Example table ─────────────────────────────────────────────────────────────
function ExampleTable() {
  return (
    <div className="mt-6 bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border text-xs font-bold text-slate-500 uppercase tracking-wider">
        דוגמה לפורמט קובץ
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-panel">
            {['שם לקוח', 'כתובת', 'עגלות', 'החל משעה', 'עד שעה', 'הערות'].map(h => (
              <th key={h} className="text-right px-3 py-2 text-amber-400 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-400">
          {[
            ['משתלת בן יוסף', 'בוסתן בגליל', '3', '', '08:00', 'לא להשאיר בחוץ'],
            ['יגור חקלאות', 'יגור', '5', '', '08:30', 'אחרי 8:30 תמיר חייב לחתום'],
            ['משתלות וונדי', 'עין ורד', '2', '07:30', '08:00', ''],
            ["עירית כפר סבא", 'כפר סבא', '0', '06:30', '07:00', "דב לאוטמן / סרג'ו"],
          ].map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((v, j) => <td key={j} className="px-3 py-2">{v || '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Merge choice dialog ─────────────────────────────────────────────────────
function MergeDialog({
  pending, existingRoutes, onFresh, onMerge,
}: {
  pending: any[]; existingRoutes: Route[]; onFresh: () => void; onMerge: () => void
}) {
  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(6px)' }}>
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 540, maxWidth: '95vw', background: '#0a1525', border: '1px solid #1e2d45' }}>
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="text-5xl mb-3">📂</div>
          <div className="font-black text-xl text-slate-100 mb-1">נמצא סידור קווים קיים להיום</div>
          <div className="text-sm text-slate-500">
            {pending.length} לקוחות בקובץ החדש · {existingRoutes.length} קווים בסידור הנוכחי
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 px-6 pb-6" dir="rtl">
          <button onClick={onMerge}
            className="rounded-2xl border-2 p-4 text-right transition-all hover:scale-[1.02] active:scale-[.98]"
            style={{ borderColor: '#10b98150', background: 'linear-gradient(135deg,#10b98115,#10b98105)', color: '#34d399' }}>
            <div className="text-2xl mb-2">✅</div>
            <div className="font-black text-sm mb-1">עדכן כמויות</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              שומר על הסידור הנוכחי (כולל שינויים ידניים).<br />
              מעדכן כמויות, משבץ לקוחות חדשים או מסמן לשיבוץ ידני.
            </div>
          </button>
          <button onClick={onFresh}
            className="rounded-2xl border-2 p-4 text-right transition-all hover:scale-[1.02] active:scale-[.98]"
            style={{ borderColor: '#3b82f650', background: 'linear-gradient(135deg,#3b82f615,#3b82f605)', color: '#60a5fa' }}>
            <div className="text-2xl mb-2">🔄</div>
            <div className="font-black text-sm mb-1">סדר קווים מחדש</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              מוחק את הסידור הנוכחי ומחשב מסלולים אופטימליים מחדש.
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Restore previous session dialog ──
function RestoreDialog({
  onRestore, onFresh
}: {
  onRestore: () => void; onFresh: () => void
}) {
  return (
    <div className="fixed inset-0 z-[9200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(6px)' }}>
      <div className="rounded-2xl shadow-2xl overflow-hidden"
        style={{ width: 440, maxWidth: '95vw', background: '#0a1525', border: '1px solid #1e2d45' }} dir="rtl">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="text-5xl mb-3">🕒</div>
          <div className="font-black text-xl text-slate-100 mb-1">נמצא סידור להיום</div>
          <div className="text-sm text-slate-500">
            יש במערכת סידור קווים ששמור להיום. האם להמשיך ממנו או להתחיל מחדש?
          </div>
        </div>
        <div className="flex flex-col gap-3 px-6 pb-6">
          <button onClick={onRestore}
            className="rounded-xl border-2 p-3 text-center transition-all hover:scale-[1.02] active:scale-[.98]"
            style={{ borderColor: '#10b98150', background: 'linear-gradient(135deg,#10b98115,#10b98105)', color: '#34d399' }}>
            <div className="font-bold text-sm">המשך את הסידור האחרון</div>
          </button>
          <button onClick={onFresh}
            className="rounded-xl border-2 p-3 text-center transition-all hover:scale-[1.02] active:scale-[.98]"
            style={{ borderColor: '#ef444450', background: 'linear-gradient(135deg,#ef444415,#ef444405)', color: '#f87171' }}>
            <div className="font-bold text-sm">התחל סידור חדש ומחק את הקודם</div>
          </button>
        </div>
      </div>
    </div>
  )
}

function StopLine({ icon, label, muted }: { icon: string; label: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[11px] shrink-0">
        {icon}
      </div>
      <span className={`text-xs ${muted ? 'text-slate-600' : 'text-slate-300'}`}>{label}</span>
    </div>
  )
}

// ─── Route card in sidebar ─────────────────────────────────────────────────────
function RouteCard({
  route, open, active, onToggle,
  dragSrc, onDragStart, onDragOver, onDrop, onDragEnd, onDeleteStop, onDeletePickup, dragOverInfo, onDeleteRoute,
}: {
  route: Route; open: boolean; active: boolean; onToggle: () => void
  dragSrc: DragSrc | null
  onDragStart: (type: 'stop' | 'pickup', routeId: number, index: number) => void
  onDragOver: (e: React.DragEvent, type: 'stop' | 'pickup', routeId: number, index: number) => void
  onDrop: (type: 'stop' | 'pickup', toRouteId: number, toIndex: number) => void
  onDragEnd: () => void
  onDeleteStop: (routeId: number, stopIdx: number) => void
  onDeletePickup: (routeId: number, pickupIdx: number) => void
  dragOverInfo: { type: 'stop' | 'pickup'; routeId: number; index: number } | null
  allDrivers: Driver[]
  onAssignDriver: (routeId: number, driverId: string) => void
  onToggleNightRoute: (routeId: number, isNight: boolean) => void
  onDeleteRoute: (routeId: number) => void
}) {
  const pct = Math.min(100, (route.total_carts / 18) * 100)
  const hasWarn = (s: RouteStop) =>
    s.notes && (s.notes.includes('חובה') || s.notes.includes('מזומן') || s.notes.includes('⚠'))

  const isDraggingOver = dragSrc && dragOverInfo?.routeId === route.id
  const isSourceRoute = dragSrc?.routeId === route.id

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        borderColor: active ? route.color : isDraggingOver ? route.color + '80' : '#1e2d45',
        background: active ? `${route.color}08` : '#0f1d30',
      }}
      // Drop onto route header = add to end
      onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
      onDrop={e => {
        e.preventDefault();
        if (dragSrc?.type === 'stop') onDrop('stop', route.id, route.stops.length);
        if (dragSrc?.type === 'pickup') onDrop('pickup', route.id, route.pickups.length);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: route.color }} />
        <span className="font-bold text-sm flex-1">{route.name} {route.isNightRoute && '🌙'}</span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {(() => {
            const pCarts = route.pickups?.reduce((a, p) => a + (p.carts !== undefined && p.carts !== '' ? Number(p.carts) : 1), 0) || 0
            return [
              [`${route.stops.length} עצירות`, route.color],
              [`🛒 ${route.total_carts} עגלות לחלוקה`, '#fbbf24'],
              ...(pCarts > 0 ? [[`↩ ${pCarts} עגלות לאיסוף`, '#a78bfa']] : []),
              [`~${route.distance_km}ק"מ`, '#94a3b8'],
            ].map(([txt, col]) => (
              <span key={txt} className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                style={{ color: col, borderColor: col + '33', background: col + '12' }}>
                {txt}
              </span>
            ))
          })()}
        </div>
        {route.stops.length === 0 && (!route.pickups || route.pickups.length === 0) && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDeleteRoute(route.id) }} 
            className="text-slate-500 hover:text-red-400 px-2" title="מחק קו ריק"
          >
            ✕
          </button>
        )}
      </div>

      {/* Capacity bar */}
      <div className="h-0.5 mx-4 mb-1 bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: route.color }} />
      </div>

      {/* Stops list */}
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-white/5">
          <StopLine icon="🏠" label="מושב חגלה — יציאה" muted />

          {route.stops.map((s, i) => {
            const isBeingDragged = dragSrc?.type === 'stop' && dragSrc?.routeId === route.id && dragSrc?.index === i
            const isDropTarget = dragOverInfo?.type === 'stop' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === i

            return (
              <div key={i}>
                {/* Drop indicator line */}
                {isDropTarget && (
                  <div className="h-0.5 rounded-full mx-1 my-0.5 transition-all"
                    style={{ background: route.color }} />
                )}

                <div
                  draggable
                  onDragStart={e => { e.stopPropagation(); onDragStart('stop', route.id, i) }}
                  onDragOver={e => onDragOver(e, 'stop', route.id, i)}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop('stop', route.id, i) }}
                  onDragEnd={onDragEnd}
                  className={`
                    flex items-start gap-2.5 py-1.5 border-b border-white/5 last:border-0
                    rounded-lg transition-all group
                    ${isBeingDragged ? 'opacity-30' : 'opacity-100'}
                    ${dragSrc ? 'cursor-grabbing' : 'cursor-grab hover:bg-white/3'}
                  `}
                >
                  {/* Drag handle */}
                  <div className="text-slate-700 group-hover:text-slate-500 text-xs pt-1 shrink-0 select-none"
                    style={{ cursor: 'grab' }}>
                    ⠿
                  </div>

                  {/* Number badge */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
                    style={{ background: route.color + '30', color: route.color }}
                  >
                    {s.cart_number || ''}
                  </div>

                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-slate-500 truncate mt-0.5">{s.address}</div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {Number(s.carts) > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-400/10 text-amber-300">
                          🛒 {s.carts}
                        </span>
                      )}
                      {s.time_window && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-300">
                          ⏰ {s.time_window}
                        </span>
                      )}
                      {hasWarn(s) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-300">⚠️</span>
                      )}
                    </div>
                    {s.notes && (
                      <div className={`mt-1 leading-relaxed text-[10px] ${hasWarn(s) ? 'text-red-300/70' : 'text-slate-500'}`}>
                        {s.notes}
                      </div>
                    )}
                  </div>

                  {/* Delete button — visible on hover */}
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteStop(route.id, i) }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400 text-xs px-1 pt-0.5"
                    title="מחק עצירה"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}

          {/* Drop zone at the end of the list */}
          {dragSrc && dragSrc.type === 'stop' && dragSrc.routeId !== route.id && (
            <div
              className="h-6 rounded-lg border border-dashed border-white/10 mt-1 flex items-center justify-center text-[10px] text-slate-600 hover:border-white/30 hover:text-slate-400 transition-all"
              onDragOver={e => onDragOver(e, 'stop', route.id, route.stops.length)}
              onDrop={e => { e.preventDefault(); onDrop('stop', route.id, route.stops.length) }}
            >
              + הוסף לסוף הקו
            </div>
          )}

          <StopLine icon="🏠" label="מושב חגלה — חזרה" muted />

          {/* ── Pickups for this route ── */}
          {(route.pickups?.length > 0 || (dragSrc && dragSrc.type === 'pickup')) && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: '#8b5cf620' }}>
              {route.pickups?.length > 0 && (
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5 px-0.5"
                  style={{ color: '#a78bfa' }}>
                  ↩ איסופים ({route.pickups.length})
                </div>
              )}
              {(route.pickups || []).map((p, i) => {
                const isBeingDragged = dragSrc?.type === 'pickup' && dragSrc?.routeId === route.id && dragSrc?.index === i
                const isDropTarget = dragOverInfo?.type === 'pickup' && dragOverInfo?.routeId === route.id && dragOverInfo?.index === i
                return (
                  <div key={p.id}>
                    {isDropTarget && (
                      <div className="h-0.5 rounded-full mx-1 my-0.5 transition-all"
                        style={{ background: '#a78bfa' }} />
                    )}
                    <div
                      draggable
                      onDragStart={e => { e.stopPropagation(); onDragStart('pickup', route.id, i) }}
                      onDragOver={e => onDragOver(e, 'pickup', route.id, i)}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop('pickup', route.id, i) }}
                      onDragEnd={onDragEnd}
                      className={`
                        flex items-start gap-2.5 py-1.5 border-b border-white/5 last:border-0
                        rounded-lg transition-all group
                        ${isBeingDragged ? 'opacity-30' : 'opacity-100'}
                        ${dragSrc ? 'cursor-grabbing' : 'cursor-grab hover:bg-white/3'}
                      `}
                      style={{ borderColor: '#8b5cf615' }}
                    >
                      <div className="text-purple-700 group-hover:text-purple-500 text-xs pt-1 shrink-0 select-none"
                        style={{ cursor: 'grab' }}>
                        ⠿
                      </div>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5"
                        style={{ background: '#8b5cf625', color: '#a78bfa' }}>↩</div>
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="font-semibold truncate" style={{ color: '#c4b5fd' }}>{p.name}</div>
                        <div className="truncate mt-0.5" style={{ color: '#7c3aed90' }}>📦 {p.what_to_collect}</div>
                        <div className="text-slate-600 truncate text-[10px]">📍 {p.address_text}</div>
                        {p.phone && <div className="text-blue-500/60 text-[10px]">📞 {p.phone}</div>}
                      </div>

                      {/* Delete button — visible on hover */}
                      <button
                        onClick={e => { e.stopPropagation(); onDeletePickup(route.id, i) }}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400 text-xs px-1 pt-0.5"
                        title="מחק איסוף מסידור זה"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
              {/* Drop zone for pickups */}
              {dragSrc && dragSrc.type === 'pickup' && dragSrc.routeId !== route.id && (
                <div
                  className="h-6 rounded-lg border border-dashed border-purple-500/30 mt-1 flex items-center justify-center text-[10px] text-purple-400 hover:border-purple-400/50 transition-all"
                  onDragOver={e => onDragOver(e, 'pickup', route.id, route.pickups.length)}
                  onDrop={e => { e.preventDefault(); onDrop('pickup', route.id, route.pickups.length) }}
                >
                  + הוסף איסוף לקו זה
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>

  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export function MainView() {
  const [result, setResult] = useState<RoutesResult | null>(null)
  const [reviewRows, setReviewRows] = useState<any[] | null>(null)  // parsed Excel rows
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [numTrucks, setNumTrucks] = useState(7)
  const [openRoute, setOpenRoute] = useState<number | null>(null)
  const [activeRoute, setActiveRoute] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [viewMode, setViewMode] = useState<'map' | 'columns'>('map')
  const [showCustomers, setShowCustomers] = useState(false)
  const [showPickups, setShowPickups] = useState(false)
  const [showDrivers, setShowDrivers] = useState(false)
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false)
  const [savedResultToRestore, setSavedResultToRestore] = useState<RoutesResult | null>(null)
  const [drivers, setDrivers] = useState<Driver[]>([])

  // ── Merge dialog state ─────────────────────────────────────────────────────────────
  const [pendingStops, setPendingStops] = useState<any[] | null>(null)
  const [pendingTrucks, setPendingTrucks] = useState(7)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [mergeWarnings, setMergeWarnings] = useState<string[]>([])
  const [mergeUnassigned, setMergeUnassigned] = useState<any[]>([])
  // ref keeps result accessible inside callbacks without re-creating them
  const resultRef = useRef<RoutesResult | null>(null)
  useEffect(() => { resultRef.current = result }, [result])
  // ref for the hidden file input used when result already exists
  const reuploadRef = useRef<HTMLInputElement>(null)

  // Load from Supabase on mount
  useEffect(() => {
    getRoutesResult().then(r => {
      // If there's a valid result saved, show the restore dialog instead of auto-loading
      if (r && r.routes && r.routes.length > 0) {
        setSavedResultToRestore(r)
      } else {
        setIsInitialLoadDone(true)
      }
    }).catch(e => {
      console.error("Failed to load saved routes:", e)
      setIsInitialLoadDone(true)
    })

    getAllDrivers().then(setDrivers).catch(e => console.error(e))
  }, [])

  // Save to Supabase whenever it changes
  useEffect(() => {
    if (isInitialLoadDone) {
      setRoutesResult(result)
    }
  }, [result, isInitialLoadDone])

  const handleRestoreChoice = (choice: 'restore' | 'fresh') => {
    if (choice === 'restore' && savedResultToRestore) {
      setResult(savedResultToRestore)
    } else {
      setResult(null)
      import('@/lib/sessionStore').then(m => m.setRoutesResult(null))
    }
    setSavedResultToRestore(null)
    setIsInitialLoadDone(true)
  }

  // Drag state
  const [dragSrc, setDragSrc] = useState<DragSrc | null>(null)
  const [dragOver, setDragOver] = useState<{ type: 'stop' | 'pickup'; routeId: number; index: number } | null>(null)

  // ── Drag handlers ────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((type: 'stop' | 'pickup', routeId: number, index: number) => {
    setDragSrc({ type, routeId, index })
    // Expand both source route and keep open
    setOpenRoute(routeId)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, type: 'stop' | 'pickup', routeId: number, index: number) => {
    e.preventDefault()
    if (!dragSrc || dragSrc.type !== type) return;
    setDragOver({ type, routeId, index })
    // Auto-expand route being dragged into
    setOpenRoute(prev => prev === routeId ? prev : routeId)
  }, [dragSrc])

  const handleDrop = useCallback((type: 'stop' | 'pickup', toRouteId: number, toIndex: number) => {
    if (!dragSrc || dragSrc.type !== type) return
    const { routeId: fromRouteId, index: fromIdx } = dragSrc

    setResult(prev => {
      if (!prev) return prev
      if (fromRouteId === toRouteId && fromIdx === toIndex) return prev

      const routes = prev.routes.map(r => ({
        ...r,
        stops: r.stops.map(s => ({ ...s })),
        pickups: r.pickups ? r.pickups.map(p => ({ ...p })) : []
      }))
      const from = routes.find(r => r.id === fromRouteId)
      const to = routes.find(r => r.id === toRouteId)
      if (!from || !to) return prev

      if (type === 'stop') {
        const [stop] = from.stops.splice(fromIdx, 1)
        // Adjust index if same route (splice shifts items)
        const adjustedToIdx = fromRouteId === toRouteId && fromIdx < toIndex ? toIndex - 1 : toIndex
        to.stops.splice(Math.max(0, adjustedToIdx), 0, stop)

        // Renumber and recalculate
        from.stops.forEach((s, i) => { s.order = i + 1 })
        to.stops.forEach((s, i) => { s.order = i + 1 })
        from.total_carts = Math.round(from.stops.reduce((a, s) => a + Number(s.carts || 0), 0) * 10) / 10
        to.total_carts = Math.round(to.stops.reduce((a, s) => a + Number(s.carts || 0), 0) * 10) / 10
        from.distance_km = calcKm(from.stops)
        to.distance_km = calcKm(to.stops)
      } else {
        const [pickup] = from.pickups.splice(fromIdx, 1)
        const adjustedToIdx = fromRouteId === toRouteId && fromIdx < toIndex ? toIndex - 1 : toIndex
        to.pickups.splice(Math.max(0, adjustedToIdx), 0, pickup)
      }

      const finalRoutes = routes.filter(r => r.stops.length > 0 || (r.pickups && r.pickups.length > 0))
      return {
        ...prev,
        routes: finalRoutes,
        total_carts: Math.round(finalRoutes.reduce((a, r) => a + r.total_carts, 0) * 10) / 10,
        total_customers: finalRoutes.reduce((a, r) => a + r.stops.length, 0),
      }
    })

    setDragSrc(null)
    setDragOver(null)
  }, [dragSrc])

  const handleDragEnd = useCallback(() => {
    setDragSrc(null)
    setDragOver(null)
  }, [])

  const handleAddRoute = useCallback(() => {
    if (!result) return
    const maxId = result.routes.reduce((max, r) => Math.max(max, r.id), 0)
    
    const colors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6']
    const color = colors[maxId % colors.length]

    const newRoute: Route = {
      id: maxId + 1,
      name: `קו חדש ${maxId + 1}`,
      color: color,
      direction: 'כללי',
      stops: [],
      pickups: [],
      total_carts: 0,
      distance_km: 0
    }
    setResult({ ...result, routes: [...result.routes, newRoute] })
  }, [result])

  const handleDeleteRoute = useCallback((routeId: number) => {
    setResult(prev => {
      if (!prev) return prev
      return {
        ...prev,
        routes: prev.routes.filter(r => r.id !== routeId)
      }
    })
  }, [])

  // ── Core: call API and set routes result ───────────────────────────────────────
  const doBuildRoutes = useCallback(async (stops: any[], trucks: number) => {
    setLoading(true); setError('')
    try {
      const pickups = await getAllPickupRecords()
      const selectedPickupIds = await getSelectedPickupIdsArray()
      const r = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops, numTrucks: trucks, pickups, selectedPickupIds }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה')
      setResult(d)
      setReviewRows(null)
      setOpenRoute(null); setActiveRoute(null)
      setNumTrucks(trucks)
      setMergeWarnings([])
      setMergeUnassigned([])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── If existing result → offer merge dialog; otherwise build fresh ──────────────
  const handleSubmitStops = useCallback(async (stops: any[], trucks: number) => {
    if (resultRef.current) {
      setPendingStops(stops)
      setPendingTrucks(trucks)
      setShowMergeDialog(true)
      return
    }
    await doBuildRoutes(stops, trucks)
  }, [doBuildRoutes])

  // ── Handle merge dialog choice ─────────────────────────────────────────────
  const handleMergeChoice = useCallback(async (choice: 'fresh' | 'merge') => {
    setShowMergeDialog(false)
    if (!pendingStops) return
    const stops = pendingStops
    const trucks = pendingTrucks
    setPendingStops(null)
    if (choice === 'fresh') {
      setResult(null)
      await doBuildRoutes(stops, trucks)
    } else {
      const existing = resultRef.current
      if (!existing) return
      const { routes, warnings, unassigned } = mergeIntoExistingRoutes(existing, stops)
      setResult({
        ...existing,
        routes,
        total_carts: Math.round(routes.reduce((a, r) => a + r.total_carts, 0) * 10) / 10,
        total_customers: routes.reduce((a, r) => a + r.stops.length, 0),
      })
      setReviewRows(null)
      setMergeWarnings(warnings)
      setMergeUnassigned(unassigned)
    }
  }, [pendingStops, pendingTrucks, doBuildRoutes])

  // ── Delete a stop from a route ──────────────────────────────────────────
  const handleDeleteStop = useCallback((routeId: number, stopIdx: number) => {
    setResult(prev => {
      if (!prev) return prev
      const routes = prev.routes.map(r => ({ ...r, stops: r.stops.map(s => ({ ...s })) }))
      const route = routes.find(r => r.id === routeId)
      if (!route) return prev
      route.stops.splice(stopIdx, 1)
      route.stops.forEach((s, i) => { s.order = i + 1 })
      route.total_carts = Math.round(route.stops.reduce((a, s) => a + Number(s.carts || 0), 0) * 10) / 10
      route.distance_km = calcKm(route.stops)
      // Remove empty routes
      const finalRoutes = routes.filter(r => r.stops.length > 0)
      return {
        ...prev,
        routes: finalRoutes,
        total_carts: Math.round(finalRoutes.reduce((a, r) => a + r.total_carts, 0) * 10) / 10,
        total_customers: finalRoutes.reduce((a, r) => a + r.stops.length, 0),
      }
    })
  }, [])

  // ── Delete a pickup from a route ──────────────────────────────────────────
  const handleDeletePickup = useCallback((routeId: number, pickupIdx: number) => {
    setResult(prev => {
      if (!prev) return prev
      const routes = prev.routes.map(r => ({ ...r, pickups: r.pickups ? r.pickups.map(p => ({ ...p })) : [] }))
      const route = routes.find(r => r.id === routeId)
      if (!route) return prev
      route.pickups.splice(pickupIdx, 1)

      const finalRoutes = routes.filter(r => r.stops.length > 0 || (r.pickups && r.pickups.length > 0))
      return {
        ...prev,
        routes: finalRoutes,
      }
    })
  }, [])

  // ── File upload → parse only, advance to review ──────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    // NOTE: do NOT clear result here — we keep it so the user can choose merge vs fresh
    setLoading(true); setError(''); setReviewRows(null)
    setOpenRoute(null); setActiveRoute(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await fetch('/api/parse', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה')
      setReviewRows(d.rows)
      await setOriginalRows(d.rows)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Reroute: extract current stops from result and re-send ─────────────────
  const handleReroute = useCallback(async () => {
    if (!result) return
    const stops = result.routes.flatMap(route =>
      route.stops.map(s => ({
        name: s.name, address: s.address,
        carts: s.carts, trays: s.trays, carriers: s.carriers,
        boxes: s.boxes, packages_h: s.packages_h,
        cart_number: s.cart_number,
        time_from: s.time_from, time_to: s.time_to,
        notes: s.notes, lat: s.lat, lng: s.lng,
      }))
    )
    if (!stops.length) return
    // Re-route always goes fresh — bypasses merge dialog
    await doBuildRoutes(stops, numTrucks)
  }, [result, numTrucks, doBuildRoutes])

  // ── Insert Pickups ONLY into existing routes ──────────────────────────────────
  const handleInsertPickups = useCallback(async () => {
    if (!result) return
    setLoading(true)
    setError('')
    try {
      const pickupsList = await getAllPickupRecords()
      const selectedIds = await getSelectedPickupIdsArray()

      // 1. Create a deep copy of the existing routes to avoid direct mutation
      const newRoutes = result.routes.map(r => ({
        ...r,
        pickups: r.pickups ? r.pickups.map(p => ({ ...p })) : []
      }))

      // 2. Identify which pickup IDs are already assigned to routes
      const assignedIds = new Set<string>()
      for (const r of newRoutes) {
        for (const p of r.pickups) {
          assignedIds.add(p.id)
        }
      }

      // 3. For already assigned pickups: update their details or remove them if no longer selected
      for (const r of newRoutes) {
        r.pickups = r.pickups
          .filter(p => selectedIds.includes(p.id)) // Remove if unselected
          .map(p => {
            const updated = pickupsList.find(item => item.id === p.id)
            if (updated) {
              // Update all fields from the database, preserving the existing position
              return {
                ...p,
                name: updated.name,
                address_text: updated.address_text,
                lat: updated.lat ?? p.lat,
                lng: updated.lng ?? p.lng,
                what_to_collect: updated.what_to_collect,
                phone: updated.phone,
                notes: updated.notes,
                carts: updated.carts,
                is_urgent: updated.is_urgent
              }
            }
            return p
          })
      }

      // 4. Identify which selected pickups are NEW (not currently assigned)
      const newSelectedPickups = pickupsList.filter(
        p => selectedIds.includes(p.id) && !assignedIds.has(p.id)
      )

      // 5. Assign new pickups to the best routes
      for (const p of newSelectedPickups) {
        if (!p.lat || !p.lng) continue

        let bestR: typeof newRoutes[0] | null = null
        let bestDist = Infinity

        const pDir = (p.lat ?? 32.38639) >= 32.38639 ? 'צפון' : 'דרום'

        // Search in routes of the same direction
        for (const route of newRoutes) {
          if (route.direction !== pDir) continue
          let minDist = Infinity
          for (const s of route.stops) {
            if (!s.lat || !s.lng) continue
            const d = haversine(p.lat, p.lng, s.lat, s.lng)
            if (d < minDist) minDist = d
          }
          if (minDist < bestDist) {
            bestDist = minDist
            bestR = route
          }
        }

        // Fallback if no routes found in that direction
        if (!bestR) {
          for (const route of newRoutes) {
            let minDist = Infinity
            for (const s of route.stops) {
              if (!s.lat || !s.lng) continue
              const d = haversine(p.lat, p.lng, s.lat, s.lng)
              if (d < minDist) minDist = d
            }
            if (minDist < bestDist) {
              bestDist = minDist
              bestR = route
            }
          }
        }

        if (bestR) {
          bestR.pickups.push({
            id: p.id,
            name: p.name,
            address_text: p.address_text,
            lat: p.lat!,
            lng: p.lng!,
            what_to_collect: p.what_to_collect,
            phone: p.phone,
            notes: p.notes,
            carts: p.carts,
            order: bestR.pickups.length
          })
        }
      }

      setResult({ ...result, routes: newRoutes })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [result])

  const handleExport = async () => {
    if (!result) return
    const missingDriver = result.routes.some(r => !r.driver)
    if (missingDriver) {
      setError('שגיאה: לא ניתן לייצא עד שלכל הקווים שובץ נהג.')
      return
    }
    setExporting(true)
    try {
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes: result.routes, date: result.date }),
      })
      const blob = await r.blob()
      const fileName = `קווים-${result.date.replace(/\//g, '-')}.xlsx`

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Excel File',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
        } catch (err: any) {
          // If the user didn't just cancel the dialog, fallback
          if (err.name !== 'AbortError') {
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = fileName
            a.click()
          }
        }
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = fileName
        a.click()
      }
    } finally { setExporting(false) }
  }

  const toggle = (id: number) => {
    setOpenRoute(p => p === id ? null : id)
    setActiveRoute(p => p === id ? null : id)
  }
  const showAll = () => { setActiveRoute(null); setOpenRoute(null) }

  // ── If in review mode, show ReviewScreen ─────────────────────────────────────
  if (reviewRows) {
    return (
      <>
        <ReviewScreen
          rows={reviewRows}
          numTrucks={numTrucks}
          setNumTrucks={setNumTrucks}
          onCancel={() => setReviewRows(null)}
          onBuildRoutes={(entries, trucks) => { handleSubmitStops(entries, trucks) }}
        />
        {showMergeDialog && pendingStops && result && (
          <MergeDialog
            pending={pendingStops}
            existingRoutes={result.routes}
            onFresh={() => handleMergeChoice('fresh')}
            onMerge={() => handleMergeChoice('merge')}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-6 py-3 bg-surface border-b border-border shrink-0">
        <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-lg">
          🚛
        </div>
        <div>
          <h1 className="font-black text-base tracking-tight">סידור קווי הפצה</h1>
          <p className="text-xs text-slate-500">ינאי בתי צמיחה</p>
        </div>

        <div className="flex gap-2 mr-auto items-center flex-wrap">
          {(() => {
            const sumPickupsCarts = result?.routes.reduce((acc, r) => acc + (r.pickups?.reduce((pA, p) => pA + (p.carts !== undefined && p.carts !== '' ? Number(p.carts) : 1), 0) || 0), 0) || 0

            return result && [
              [`🚛 ${result.routes.length} קווים`, '#f59e0b'],
              [`👥 ${result.total_customers} לקוחות`, '#3b82f6'],
              [`🛒 ${result.total_carts} עגלות לחלוקה`, '#10b981'],
              ...(sumPickupsCarts > 0 ? [[`↩ ${sumPickupsCarts} עגלות לאיסוף`, '#8b5cf6']] : []),
            ].map(([txt, col]) => (
              <span key={txt} className="text-xs font-bold px-3 py-1 rounded-full border"
                style={{ color: col, borderColor: col + '40', background: col + '12' }}>
                {txt}
              </span>
            ))
          })()}

          {/* Customers DB button */}
          <button
            onClick={() => setShowCustomers(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-black rounded-xl border-2 transition-all"
            style={{
              background: 'linear-gradient(135deg, #f59e0b18, #f59e0b08)',
              color: '#f59e0b',
              borderColor: '#f59e0b50',
              boxShadow: '0 0 12px rgba(245,158,11,.15)',
            }}
          >
            👥 לקוחות
          </button>

          {/* Pickups button */}
          <button
            onClick={() => setShowPickups(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-black rounded-xl border-2 transition-all"
            style={{
              background: 'linear-gradient(135deg, #8b5cf618, #8b5cf608)',
              color: '#a78bfa',
              borderColor: '#8b5cf650',
              boxShadow: '0 0 12px rgba(139,92,246,.15)',
            }}
          >
            ↩ איסופים
          </button>

          {/* Drivers button */}
          <button
            onClick={() => setShowDrivers(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-black rounded-xl border-2 transition-all"
            style={{
              background: 'linear-gradient(135deg, #3b82f618, #3b82f608)',
              color: '#60a5fa',
              borderColor: '#3b82f650',
              boxShadow: '0 0 12px rgba(59,130,246,.15)',
            }}
          >
            👨‍✈️ נהגים
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => document.documentElement.classList.toggle('light-mode')}
            className="flex items-center justify-center w-[38px] h-[38px] rounded-xl border-2 transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #94a3b815, #94a3b805)',
              borderColor: '#94a3b840',
            }}
            title="החלף תצוגה מוארת/חשוכה"
          >
            🌓
          </button>

          {/* View toggle — only shown when there are results */}
          {result && (
            <div className="flex items-center bg-panel border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode('map')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all"
                style={{
                  background: viewMode === 'map' ? '#f59e0b20' : 'transparent',
                  color: viewMode === 'map' ? '#f59e0b' : '#475569',
                }}
              >
                🗺️ מפה
              </button>
              <div className="w-px h-4 bg-border" />
              <button
                onClick={() => setViewMode('columns')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-all"
                style={{
                  background: viewMode === 'columns' ? '#3b82f620' : 'transparent',
                  color: viewMode === 'columns' ? '#93c5fd' : '#475569',
                }}
              >
                📋 קווים
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Restore dialog */}
      {savedResultToRestore && (
        <RestoreDialog
          onRestore={() => handleRestoreChoice('restore')}
          onFresh={() => handleRestoreChoice('fresh')}
        />
      )}

      {/* Customer manager modal */}
      {showCustomers && <CustomerManager onClose={() => setShowCustomers(false)} />}

      {/* Pickups manager modal */}
      {showPickups && <PickupsManager onClose={() => setShowPickups(false)} />}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Columns view (full screen, no sidebar) ── */}
        {viewMode === 'columns' && result && (
          <div className="flex-1 overflow-hidden" style={{ background: '#080f1a' }}>
            <ColumnsView
              routes={result.routes}
              dragSrc={dragSrc}
              dragOverInfo={dragOver}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              allDrivers={drivers}
              onAssignDriver={(routeId, driverId) => {
                const drv = drivers.find(d => d.id === driverId)
                const updated = result.routes.map(r => r.id === routeId ? { ...r, driver: drv } : r)
                setResult({ ...result, routes: updated })
              }}
              onToggleNightRoute={(routeId, isNight) => {
                const updated = result.routes.map(r => r.id === routeId ? { ...r, isNightRoute: isNight } : r)
                setResult({ ...result, routes: updated })
              }}
              onAddRoute={handleAddRoute}
              onDeleteRoute={handleDeleteRoute}
              onUpdateRouteName={(routeId, name) => {
                const updated = result.routes.map(r => r.id === routeId ? { ...r, name } : r)
                setResult({ ...result, routes: updated })
              }}
              onReorderRoute={(draggedRouteId, targetRouteId) => {
                if (draggedRouteId === targetRouteId) return
                const draggedIdx = result.routes.findIndex(r => r.id === draggedRouteId)
                const targetIdx = result.routes.findIndex(r => r.id === targetRouteId)
                if (draggedIdx === -1 || targetIdx === -1) return
                const updated = [...result.routes]
                const [dragged] = updated.splice(draggedIdx, 1)
                updated.splice(targetIdx, 0, dragged)
                setResult({ ...result, routes: updated })
              }}
            />
          </div>
        )}

        {/* ── Map mode: Sidebar + Map ── */}
        {(viewMode === 'map' || !result) && (
          <>
            {/* ── Sidebar ── */}
            <div className="w-[370px] shrink-0 flex flex-col bg-surface border-l border-border overflow-hidden">

              {/* Controls */}
              <div className="p-4 border-b border-border space-y-3">
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      משאיות
                    </label>
                    <input
                      type="number" min={1} max={20} value={numTrucks}
                      onChange={e => setNumTrucks(parseInt(e.target.value) || 1)}
                      className="input w-20 text-center text-xl font-black"
                    />
                  </div>
                  <div className="flex-1 text-xs text-slate-500 leading-relaxed pb-1">
                    בחרי את מספר המשאיות הזמינות היום. המערכת תחלק בצורה מיטבית.
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 text-xs text-red-300">
                    ⚠️ {error}
                  </div>
                )}

                {/* Drag instruction */}
                {result && (
                  <div className="text-[10px] text-slate-600 flex items-center gap-1.5">
                    <span>⠿</span>
                    <span>גרור עצירות בין קווים או בתוך קו לשינוי הסדר</span>
                  </div>
                )}
              </div>

              {/* Scroll area */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">

                {/* Upload zone — shown only when no result yet */}
                {!result && (
                  <UploadZone onFile={handleFile} loading={loading} />
                )}

                {/* Hidden file input for re-upload when result already exists */}
                <input
                  ref={reuploadRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; handleFile(f) } }}
                />


                {result && (
                  <>
                    <div className="flex gap-2">
                      {/* New file button — opens picker WITHOUT clearing result */}
                      <button
                        className="btn-ghost flex-1 text-[11px] h-9 px-0"
                        onClick={() => { setError(''); reuploadRef.current?.click() }}
                      >
                        📂 סידור חדש
                      </button>

                      <button
                        className="btn-ghost flex-1 text-[11px] h-9 px-0 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        onClick={async () => {
                          const orig = await getOriginalRows()
                          if (orig) {
                            setReviewRows(orig)
                          } else {
                            alert('לא נמצא קובץ הלקוחות המקורי. אנא העלה מחדש את סידור הבוקר ע"י לחיצה על "סידור חדש".')
                          }
                        }}
                      >
                        ✏️ עריכת לקוחות
                      </button>
                    </div>

                    {/* Re-route button */}
                    <button
                      className="w-full text-sm font-bold py-2 rounded-xl border-2 transition-all"
                      disabled={loading}
                      onClick={handleReroute}
                      style={{
                        background: loading ? '#1e2d45' : 'linear-gradient(135deg,#3b82f618,#3b82f608)',
                        color: loading ? '#475569' : '#60a5fa',
                        borderColor: loading ? '#1e2d45' : '#3b82f640',
                      }}
                    >
                      {loading ? '⏳ מסדר...' : '🔄 סדר קווים מחדש'}
                    </button>

                    {/* Insert Pickups ONLY button */}
                    <button
                      className="w-full text-sm font-bold py-2 rounded-xl border-2 transition-all"
                      disabled={loading}
                      onClick={handleInsertPickups}
                      style={{
                        background: loading ? '#1e2d45' : 'linear-gradient(135deg,#8b5cf618,#8b5cf608)',
                        color: loading ? '#475569' : '#a78bfa',
                        borderColor: loading ? '#1e2d45' : '#8b5cf640',
                      }}
                    >
                      {loading ? '⏳ מסדר איסופים...' : '↩ הכנס איסופים'}
                    </button>

                    {/* Export */}
                    <button className="btn-primary w-full" onClick={handleExport} disabled={exporting}>
                      {exporting ? '⏳ מייצא...' : '📥 ייצוא Excel לנהגים'}
                    </button>

                    {/* Merge warnings */}
                    {mergeWarnings.length > 0 && (
                      <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 text-xs">
                        <div className="font-bold text-amber-400 mb-1.5">⚠️ חריגות עומס ({mergeWarnings.length})</div>
                        {mergeWarnings.map((w, i) => (
                          <div key={i} className="text-amber-300/80 py-0.5">{w}</div>
                        ))}
                      </div>
                    )}

                    {/* Unassigned after merge */}
                    {mergeUnassigned.length > 0 && (
                      <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl p-3 text-xs">
                        <div className="font-bold text-blue-400 mb-1.5">🔵 ממתינים לשיבוץ ידני ({mergeUnassigned.length})</div>
                        {mergeUnassigned.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 py-0.5 border-b border-white/5 last:border-0">
                            <span className="text-slate-400 flex-1 truncate font-medium">{s.name}</span>
                            <span className="text-slate-600 text-[10px] shrink-0">{s._reason}</span>
                          </div>
                        ))}
                        <div className="text-slate-600 mt-1.5">גרור לקו המתאים מרשימת הקווים</div>
                      </div>
                    )}

                    {/* No-address warning */}
                    {result.no_address.length > 0 && (
                      <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3 text-xs">
                        <div className="font-bold text-red-400 mb-1">⚠️ חסרה כתובת ({result.no_address.length})</div>
                        <div className="text-red-300/80 leading-relaxed">
                          {result.no_address.join('، ')}
                        </div>
                        <div className="text-slate-500 mt-1">הוסיפי כתובת לקובץ כדי שיופיעו על המפה</div>
                      </div>
                    )}

                    {/* Show all toggle */}
                    <button className="btn-ghost w-full text-xs py-1.5" onClick={showAll}>
                      ○ הצג את כל הקווים
                    </button>

                    {/* Add route button */}
                    <button className="btn-ghost w-full text-xs py-1.5 mt-1 border border-dashed border-slate-600/50 hover:bg-white/5" onClick={handleAddRoute}>
                      ➕ הוסף קו חדש
                    </button>

                    {/* Route cards */}
                    {result.routes.map(route => (
                      <RouteCard
                        key={route.id}
                        route={route}
                        open={openRoute === route.id}
                        active={activeRoute === route.id}
                        onToggle={() => toggle(route.id)}
                        dragSrc={dragSrc}
                        dragOverInfo={dragOver}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        onDeleteStop={handleDeleteStop}
                        onDeletePickup={handleDeletePickup}
                        allDrivers={drivers}
                        onAssignDriver={(routeId, driverId) => {
                          const drv = drivers.find(d => d.id === driverId)
                          const updated = result.routes.map(r => r.id === routeId ? { ...r, driver: drv } : r)
                          setResult({ ...result, routes: updated })
                        }}
                        onToggleNightRoute={(routeId, isNight) => {
                          const updated = result.routes.map(r => r.id === routeId ? { ...r, isNightRoute: isNight } : r)
                          setResult({ ...result, routes: updated })
                        }}
                        onDeleteRoute={handleDeleteRoute}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Map ── */}
            <div className="flex-1 relative">
              <MapView
                routes={result?.routes ?? []}
                activeId={activeRoute}
                onSelect={toggle}
              />

              {/* Map legend */}
              {result && result.routes.length > 0 && (
                <div
                  className="absolute bottom-5 right-5 bg-base/90 backdrop-blur border border-border rounded-2xl p-3 z-[1000] text-xs space-y-1.5"
                  style={{ minWidth: 160 }}
                >
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">קווים</div>
                  <div
                    className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-white transition-colors"
                    onClick={showAll}
                  >
                    <div className="w-2 h-2 rounded-full bg-slate-600" />
                    <span>הצג הכל</span>
                  </div>
                  {result.routes.map(r => (
                    <div
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      className="flex items-center gap-2 cursor-pointer transition-opacity"
                      style={{ opacity: activeRoute && activeRoute !== r.id ? 0.3 : 1 }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ background: r.color }} />
                      <span>{r.name}</span>
                      <span className="text-slate-500 mr-auto">{r.total_carts}🛒</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-1.5 mt-1 text-[10px] text-slate-600">🏠 מושב חגלה</div>
                </div>
              )}

              {/* Empty map placeholder — subtle, not covering */}
              {!result && !loading && (
                <div className="absolute bottom-4 right-4 pointer-events-none">
                  <div className="text-right text-slate-700 text-xs">
                    📍 מושב חגלה
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showCustomers && <CustomerManager onClose={() => setShowCustomers(false)} />}
      {showPickups && <PickupsManager onClose={() => setShowPickups(false)} />}
      {showDrivers && (
        <DriversManager
          onClose={() => {
            setShowDrivers(false)
            // Reload drivers just in case changes were made
            getAllDrivers().then(setDrivers).catch(e => console.error(e))
          }}
        />
      )}
    </div>
  )
}
