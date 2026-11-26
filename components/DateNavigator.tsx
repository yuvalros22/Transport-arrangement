'use client'
import { useState, useEffect, useRef } from 'react'
import {
  addDaysStr,
  formatDateHeDisplay,
  formatDayOfWeekHe,
  getRelativeDateInfo,
  getSavedSessionDates,
} from '@/lib/sessionStore'

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]
const WEEKDAY_HEADERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

interface DateNavigatorProps {
  selectedDate: string
  israelToday: string
  onSelectDate: (dateStr: string) => void
  hasCurrentRoutes?: boolean
  isReadOnly?: boolean
}

export function DateNavigator({
  selectedDate,
  israelToday,
  onSelectDate,
  hasCurrentRoutes = false,
  isReadOnly = false,
}: DateNavigatorProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [selYear, selMonth] = selectedDate.split('-').map(Number)
  const [viewYear, setViewYear] = useState<number>(selYear || new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(selMonth || new Date().getMonth() + 1) // 1..12
  const [savedDates, setSavedDates] = useState<Set<string>>(() => new Set())
  const [loadingMonth, setLoadingMonth] = useState(false)

  // Keep calendar month synced when selectedDate changes externally
  useEffect(() => {
    const [y, m] = selectedDate.split('-').map(Number)
    if (y && m) {
      setViewYear(y)
      setViewMonth(m)
    }
  }, [selectedDate])

  // Close popover on click outside or Escape
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Fetch saved session dates for visible month when popover is open
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const mm = String(viewMonth).padStart(2, '0')
    const lastDay = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate()
    const fromDate = `${viewYear}-${mm}-01`
    const toDate = `${viewYear}-${mm}-${String(lastDay).padStart(2, '0')}`

    setLoadingMonth(true)
    getSavedSessionDates(fromDate, toDate)
      .then(dates => {
        if (!cancelled) setSavedDates(dates)
      })
      .finally(() => {
        if (!cancelled) setLoadingMonth(false)
      })

    return () => { cancelled = true }
  }, [open, viewYear, viewMonth, hasCurrentRoutes])

  const tomorrowStr = addDaysStr(israelToday, 1)
  const yesterdayStr = addDaysStr(israelToday, -1)
  const rel = getRelativeDateInfo(selectedDate, israelToday)
  const dayName = formatDayOfWeekHe(selectedDate)
  const displayDate = formatDateHeDisplay(selectedDate)

  const badgeColors: Record<typeof rel.kind, { fg: string; bg: string; border: string }> = {
    today: { fg: '#34d399', bg: '#10b98120', border: '#10b98150' },
    tomorrow: { fg: '#38bdf8', bg: '#0ea5e920', border: '#0ea5e950' },
    future: { fg: '#a5b4fc', bg: '#6366f120', border: '#6366f150' },
    past: { fg: '#cbd5e1', bg: '#64748b25', border: '#64748b55' },
  }
  const tone = badgeColors[rel.kind]

  const shiftMonth = (delta: number) => {
    const dt = new Date(Date.UTC(viewYear, viewMonth - 1 + delta, 1))
    setViewYear(dt.getUTCFullYear())
    setViewMonth(dt.getUTCMonth() + 1)
  }

  // Build calendar cells for viewYear / viewMonth
  const firstDow = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay() // 0 = Sun
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5" dir="rtl">
      {/* Stepper + Main Date Trigger */}
      <div
        className="flex items-center rounded-xl border-2 overflow-hidden transition-all"
        style={{
          borderColor: tone.border,
          background: '#0f1d30',
        }}
      >
        {/* Previous day (right side in RTL) */}
        <button
          type="button"
          onClick={() => onSelectDate(addDaysStr(selectedDate, -1))}
          className="px-2.5 py-2 text-xs font-black text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="יום קודם"
        >
          ❯
        </button>

        {/* Open Calendar Button */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 transition-colors border-x border-white/10"
          title="בחר תאריך סידור"
        >
          <span className="text-sm">{isReadOnly ? '🔒' : '📅'}</span>
          <div className="flex items-center gap-1.5 text-right">
            <span className="font-black text-sm text-slate-100 whitespace-nowrap">
              {dayName} · {displayDate}
            </span>
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap"
              style={{
                color: tone.fg,
                background: tone.bg,
                borderColor: tone.border,
              }}
            >
              {rel.label}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 mr-0.5">{open ? '▴' : '▾'}</span>
        </button>

        {/* Next day (left side in RTL) */}
        <button
          type="button"
          onClick={() => onSelectDate(addDaysStr(selectedDate, 1))}
          className="px-2.5 py-2 text-xs font-black text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="יום הבא"
        >
          ❮
        </button>
      </div>

      {/* Quick Today / Tomorrow shortcuts */}
      <div className="hidden sm:flex items-center bg-panel border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => onSelectDate(israelToday)}
          className="px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap"
          style={{
            background: selectedDate === israelToday ? '#10b98125' : 'transparent',
            color: selectedDate === israelToday ? '#34d399' : '#94a3b8',
          }}
          title={`עבור להיום (${formatDateHeDisplay(israelToday)})`}
        >
          היום
        </button>
        <div className="w-px h-4 bg-border" />
        <button
          type="button"
          onClick={() => onSelectDate(tomorrowStr)}
          className="px-2.5 py-1.5 text-xs font-bold transition-all whitespace-nowrap"
          style={{
            background: selectedDate === tomorrowStr ? '#0ea5e925' : 'transparent',
            color: selectedDate === tomorrowStr ? '#38bdf8' : '#94a3b8',
          }}
          title={`עבור למחר (${formatDateHeDisplay(tomorrowStr)})`}
        >
          מחר
        </button>
      </div>

      {/* Calendar Dropdown Popover */}
      {open && (
        <div
          className="absolute top-full right-0 mt-2 z-[9300] rounded-2xl shadow-2xl p-4 select-none"
          style={{
            width: 310,
            background: '#0a1525',
            border: '1px solid #1e2d45',
          }}
        >
          {/* Quick jump pills inside popover */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[
              { label: 'אתמול', date: yesterdayStr },
              { label: 'היום', date: israelToday },
              { label: 'מחר', date: tomorrowStr },
            ].map(q => {
              const active = selectedDate === q.date
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => {
                    onSelectDate(q.date)
                    setOpen(false)
                  }}
                  className="py-1.5 rounded-lg text-xs font-bold border transition-all"
                  style={{
                    borderColor: active ? '#38bdf8' : '#1e2d45',
                    background: active ? '#0ea5e920' : '#0f1d30',
                    color: active ? '#38bdf8' : '#cbd5e1',
                  }}
                >
                  {q.label}
                </button>
              )
            })}
          </div>

          {/* Month Header */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="חודש קודם"
            >
              ❯
            </button>
            <div className="font-black text-sm text-slate-100">
              {HEBREW_MONTHS[viewMonth - 1]} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="חודש הבא"
            >
              ❮
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEKDAY_HEADERS.map(w => (
              <div key={w} className="text-[10px] font-bold text-slate-500 py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((dateStr, idx) => {
              if (!dateStr) return <div key={`empty-${idx}`} className="h-9" />
              const dayNum = Number(dateStr.slice(8, 10))
              const isSelected = dateStr === selectedDate
              const isToday = dateStr === israelToday
              const isPast = dateStr < israelToday
              const hasSaved = savedDates.has(dateStr) || (dateStr === selectedDate && hasCurrentRoutes)

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    onSelectDate(dateStr)
                    setOpen(false)
                  }}
                  className="h-9 rounded-lg flex flex-col items-center justify-center relative transition-all hover:bg-white/10"
                  style={{
                    background: isSelected ? '#0ea5e930' : 'transparent',
                    border: isSelected
                      ? '1.5px solid #38bdf8'
                      : isToday
                        ? '1px solid #10b98180'
                        : '1px solid transparent',
                    color: isSelected
                      ? '#fff'
                      : isToday
                        ? '#34d399'
                        : isPast
                          ? '#94a3b8'
                          : '#e2e8f0',
                  }}
                  title={`${formatDayOfWeekHe(dateStr)} ${formatDateHeDisplay(dateStr)}${hasSaved ? ' · קיים סידור שמור' : ''}`}
                >
                  <span className="text-xs font-bold leading-none">{dayNum}</span>
                  {hasSaved && (
                    <span
                      className="w-1.5 h-1.5 rounded-full mt-1"
                      style={{ background: '#10b981' }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          {/* Footer Legend */}
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#10b981' }} />
              <span>קיים סידור שמור</span>
            </div>
            {loadingMonth && <span className="text-slate-500">טוען...</span>}
          </div>
        </div>
      )}
    </div>
  )
}
