import { supabase } from './supabase'
import type { ReviewEntry, RoutesResult } from '@/types'

function todayStr(): string { return new Date().toISOString().slice(0, 10) }

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

/** Fetch today's session from Supabase */
export async function loadSession(): Promise<SessionData> {
    const today = todayStr()
    const { data, error } = await supabase.from('daily_sessions').select('data').eq('date', today).maybeSingle()
    if (error || !data) return emptySession()
    
    // Fallbacks just in case
    return {
        manualEntries: data.data.manualEntries || [],
        entryOverrides: data.data.entryOverrides || {},
        selectedPickupIds: data.data.selectedPickupIds || [],
        routesResult: data.data.routesResult,
        originalRows: data.data.originalRows
    }
}

/** Save entirely new session object */
async function saveSession(session: SessionData) {
    const today = todayStr()
    await supabase.from('daily_sessions').upsert({
        date: today,
        data: session,
        updated_at: new Date().toISOString()
    })
}

export async function getManualEntries(): Promise<ReviewEntry[]> {
    return (await loadSession()).manualEntries
}

export async function upsertManualEntry(entry: ReviewEntry) {
    const s = await loadSession()
    const idx = s.manualEntries.findIndex(e => e.code === entry.code)
    if (idx >= 0) s.manualEntries[idx] = entry
    else s.manualEntries.push(entry)
    await saveSession(s)
}

export async function removeManualEntry(code: string) {
    const s = await loadSession()
    s.manualEntries = s.manualEntries.filter(e => e.code !== code)
    await saveSession(s)
}

export async function getEntryOverrides(): Promise<Record<string, EntryOverride>> {
    return (await loadSession()).entryOverrides
}

export async function setEntryOverride(code: string, patch: EntryOverride) {
    const s = await loadSession()
    s.entryOverrides[code] = { ...(s.entryOverrides[code] || {}), ...patch }
    await saveSession(s)
}

export async function clearEntryOverride(code: string) {
    const s = await loadSession()
    delete s.entryOverrides[code]
    await saveSession(s)
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

export async function cancelEntry(code: string) {
    const s = await loadSession()
    if (!s.entryOverrides[`__cancelled__${code}`]) {
        s.entryOverrides[`__cancelled__${code}`] = {}
        await saveSession(s)
    }
}

export async function restoreEntry(code: string) {
    const s = await loadSession()
    if (s.entryOverrides[`__cancelled__${code}`]) {
        delete s.entryOverrides[`__cancelled__${code}`]
        await saveSession(s)
    }
}

export async function getCancelledCodes(): Promise<Set<string>> {
    const overrides = await getEntryOverrides()
    const codes = new Set<string>()
    for (const key of Object.keys(overrides)) {
        if (key.startsWith('__cancelled__')) codes.add(key.slice('__cancelled__'.length))
    }
    return codes
}

export async function getSelectedPickupIds(): Promise<Set<string>> {
    return new Set((await loadSession()).selectedPickupIds)
}

export async function setPickupSelected(id: string, selected: boolean) {
    const s = await loadSession()
    const ids = new Set(s.selectedPickupIds || [])
    if (selected) ids.add(id)
    else ids.delete(id)
    s.selectedPickupIds = Array.from(ids)
    await saveSession(s)
}

export async function isPickupSelected(id: string): Promise<boolean> {
    return (await loadSession()).selectedPickupIds.includes(id)
}

export async function getSelectedPickupIdsArray(): Promise<string[]> {
    return (await loadSession()).selectedPickupIds
}

export async function getRoutesResult(): Promise<RoutesResult | undefined> {
    return (await loadSession()).routesResult
}

export async function setRoutesResult(routes: RoutesResult | null) {
    const s = await loadSession()
    if (!routes) delete s.routesResult
    else s.routesResult = routes
    await saveSession(s)
}

export async function getOriginalRows(): Promise<any[] | undefined> {
    return (await loadSession()).originalRows
}

export async function setOriginalRows(rows: any[] | null) {
    const s = await loadSession()
    if (!rows) delete s.originalRows
    else s.originalRows = rows
    await saveSession(s)
}
