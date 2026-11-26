import { supabase } from './supabase'
import type { ReviewEntry, RoutesResult } from '@/types'

const HEBREW_DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'יום שבת']

/** Returns current YYYY-MM-DD according to Israel timezone (Asia/Jerusalem) */
export function getIsraelTodayStr(): string {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(new Date())
        const y = parts.find(p => p.type === 'year')?.value
        const m = parts.find(p => p.type === 'month')?.value
        const d = parts.find(p => p.type === 'day')?.value
        if (y && m && d) return `${y}-${m}-${d}`
    } catch {
        // Fallback to browser local date
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Pure calendar day arithmetic on YYYY-MM-DD (immune to DST shifts) */
export function addDaysStr(dateStr: string, deltaDays: number): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays))
    const ry = dt.getUTCFullYear()
    const rm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const rd = String(dt.getUTCDate()).padStart(2, '0')
    return `${ry}-${rm}-${rd}`
}

/** Formats YYYY-MM-DD -> DD/MM/YYYY */
export function formatDateHeDisplay(dateStr: string): string {
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/** Returns Hebrew weekday name for YYYY-MM-DD (e.g. "יום חמישי") */
export function formatDayOfWeekHe(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return ''
    const dt = new Date(Date.UTC(y, m - 1, d))
    return HEBREW_DAYS[dt.getUTCDay()] || ''
}

/** Relative label comparing dateStr against Israel today */
export function getRelativeDateInfo(
    dateStr: string,
    todayStr: string = getIsraelTodayStr()
): { label: string; kind: 'today' | 'tomorrow' | 'future' | 'past' } {
    if (dateStr === todayStr) return { label: 'היום', kind: 'today' }
    if (dateStr === addDaysStr(todayStr, 1)) return { label: 'מחר', kind: 'tomorrow' }
    if (dateStr === addDaysStr(todayStr, 2)) return { label: 'מחרתיים', kind: 'future' }
    if (dateStr === addDaysStr(todayStr, -1)) return { label: 'אתמול', kind: 'past' }
    if (dateStr > todayStr) return { label: 'תאריך עתידי', kind: 'future' }
    return { label: 'תאריך עבר', kind: 'past' }
}

// ─── Active Working Date State ────────────────────────────────────────────────
let activeSessionDate: string = getIsraelTodayStr()

export function getActiveSessionDate(): string {
    return activeSessionDate
}

export function setActiveSessionDate(dateStr: string) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        activeSessionDate = dateStr
    }
}

export interface EntryOverride {
    lat?: number
    lng?: number
    address_text?: string
    time_from?: string
    time_to?: string
    carts?: number
    notes?: string
}

export interface SessionData {
    manualEntries: ReviewEntry[]
    entryOverrides: Record<string, EntryOverride>
    selectedPickupIds: string[]
    routesResult?: RoutesResult
    originalRows?: any[]
}

const emptySession = (): SessionData => ({
    manualEntries: [],
    entryOverrides: {},
    selectedPickupIds: []
})

/** Fetch session for target date (defaults to active working date) from Supabase */
export async function loadSession(targetDate: string = activeSessionDate): Promise<SessionData> {
    const { data, error } = await supabase
        .from('daily_sessions')
        .select('data')
        .eq('date', targetDate)
        .maybeSingle()
    if (error || !data || !data.data) return emptySession()

    return {
        manualEntries: data.data.manualEntries || [],
        entryOverrides: data.data.entryOverrides || {},
        selectedPickupIds: data.data.selectedPickupIds || [],
        routesResult: data.data.routesResult,
        originalRows: data.data.originalRows
    }
}

/** Save session object for target date (defaults to active working date) */
async function saveSession(session: SessionData, targetDate: string = activeSessionDate) {
    await supabase.from('daily_sessions').upsert({
        date: targetDate,
        data: session,
        updated_at: new Date().toISOString()
    })
}

/** Completely clear/reset the session for a given date */
export async function clearDailySession(targetDate: string = activeSessionDate) {
    const { error } = await supabase.from('daily_sessions').delete().eq('date', targetDate)
    if (error) {
        // Fallback if DELETE is restricted by RLS
        await saveSession(emptySession(), targetDate)
    }
}

/** Fetch set of YYYY-MM-DD dates in [fromDate, toDate] that have saved routes */
export async function getSavedSessionDates(fromDate: string, toDate: string): Promise<Set<string>> {
    const result = new Set<string>()
    const { data, error } = await supabase
        .from('daily_sessions')
        .select('date, data')
        .gte('date', fromDate)
        .lte('date', toDate)

    if (error || !data) return result

    for (const row of data as any[]) {
        const routes = row?.data?.routesResult?.routes
        if (row?.date && Array.isArray(routes) && routes.length > 0) {
            result.add(row.date)
        }
    }
    return result
}

export async function getManualEntries(targetDate: string = activeSessionDate): Promise<ReviewEntry[]> {
    return (await loadSession(targetDate)).manualEntries
}

export async function upsertManualEntry(entry: ReviewEntry, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    const idx = s.manualEntries.findIndex(e => e.code === entry.code)
    if (idx >= 0) s.manualEntries[idx] = entry
    else s.manualEntries.push(entry)
    await saveSession(s, targetDate)
}

export async function removeManualEntry(code: string, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    s.manualEntries = s.manualEntries.filter(e => e.code !== code)
    await saveSession(s, targetDate)
}

export async function getEntryOverrides(targetDate: string = activeSessionDate): Promise<Record<string, EntryOverride>> {
    return (await loadSession(targetDate)).entryOverrides
}

export async function setEntryOverride(code: string, patch: EntryOverride, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    s.entryOverrides[code] = { ...(s.entryOverrides[code] || {}), ...patch }
    await saveSession(s, targetDate)
}

export async function clearEntryOverride(code: string, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    delete s.entryOverrides[code]
    await saveSession(s, targetDate)
}

/** @deprecated */
export async function getAddressOverrides(): Promise<Record<string, { lat: number; lng: number; address_text: string }>> {
    const overrides = await getEntryOverrides()
    const result: any = {}
    for (const [k, v] of Object.entries(overrides)) {
        if (v.lat !== undefined && v.lng !== undefined && v.address_text !== undefined) {
            result[k] = { lat: v.lat, lng: v.lng, address_text: v.address_text }
        }
    }
    return result
}

/** @deprecated */
export async function setAddressOverride(code: string, lat: number, lng: number, address_text: string) {
    await setEntryOverride(code, { lat, lng, address_text })
}

export async function cancelEntry(code: string, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    if (!s.entryOverrides[`__cancelled__${code}`]) {
        s.entryOverrides[`__cancelled__${code}`] = {}
        await saveSession(s, targetDate)
    }
}

export async function restoreEntry(code: string, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    if (s.entryOverrides[`__cancelled__${code}`]) {
        delete s.entryOverrides[`__cancelled__${code}`]
        await saveSession(s, targetDate)
    }
}

export async function getCancelledCodes(targetDate: string = activeSessionDate): Promise<Set<string>> {
    const overrides = await getEntryOverrides(targetDate)
    const codes = new Set<string>()
    for (const key of Object.keys(overrides)) {
        if (key.startsWith('__cancelled__')) codes.add(key.slice('__cancelled__'.length))
    }
    return codes
}

export async function getSelectedPickupIds(targetDate: string = activeSessionDate): Promise<Set<string>> {
    return new Set((await loadSession(targetDate)).selectedPickupIds)
}

export async function setPickupSelected(id: string, selected: boolean, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    const ids = new Set(s.selectedPickupIds || [])
    if (selected) ids.add(id)
    else ids.delete(id)
    s.selectedPickupIds = Array.from(ids)
    await saveSession(s, targetDate)
}

export async function setMultiplePickupsSelected(idsToSet: string[], selected: boolean, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    const ids = new Set(s.selectedPickupIds || [])
    for (const id of idsToSet) {
        if (selected) ids.add(id)
        else ids.delete(id)
    }
    s.selectedPickupIds = Array.from(ids)
    await saveSession(s, targetDate)
}

export async function isPickupSelected(id: string, targetDate: string = activeSessionDate): Promise<boolean> {
    return (await loadSession(targetDate)).selectedPickupIds.includes(id)
}

export async function getSelectedPickupIdsArray(targetDate: string = activeSessionDate): Promise<string[]> {
    return (await loadSession(targetDate)).selectedPickupIds
}

export async function getRoutesResult(targetDate: string = activeSessionDate): Promise<RoutesResult | undefined> {
    return (await loadSession(targetDate)).routesResult
}

export async function setRoutesResult(routes: RoutesResult | null, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    if (!routes) delete s.routesResult
    else s.routesResult = routes
    await saveSession(s, targetDate)
}

export async function getOriginalRows(targetDate: string = activeSessionDate): Promise<any[] | undefined> {
    return (await loadSession(targetDate)).originalRows
}

export async function setOriginalRows(rows: any[] | null, targetDate: string = activeSessionDate) {
    const s = await loadSession(targetDate)
    if (!rows) delete s.originalRows
    else s.originalRows = rows
    await saveSession(s, targetDate)
}
