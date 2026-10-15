import { supabase } from './supabase'
import type { PickupRecord, PickupCompletion } from '@/types'

function todayStr(): string { return new Date().toISOString().slice(0, 10) }

export async function getAllPickupRecords(): Promise<PickupRecord[]> {
    const { data: pData, error: pErr } = await supabase.from('pickups').select('*')
    if (pErr) { console.error(pErr); return [] }

    const { data: cData, error: cErr } = await supabase.from('pickup_completions').select('*').order('date', { ascending: false })
    if (cErr) { console.error(cErr); return [] }

    return pData.map(p => ({
        ...p,
        carts: p.carts || 0,
        is_urgent: p.is_urgent || false,
        completions: cData.filter(c => c.pickup_id === p.id).map(c => ({
            date: c.date,
            done: c.done,
            note: c.note || undefined
        }))
    }))
}

export async function getPickupRecord(id: string): Promise<PickupRecord | null> {
    const { data: p, error: pErr } = await supabase.from('pickups').select('*').eq('id', id).maybeSingle()
    if (pErr || !p) return null

    const { data: cData } = await supabase.from('pickup_completions').select('*').eq('pickup_id', id).order('date', { ascending: false })
    
    return {
        ...p,
        carts: p.carts || 0,
        is_urgent: p.is_urgent || false,
        completions: (cData || []).map(c => ({ date: c.date, done: c.done, note: c.note || undefined }))
    }
}

let hasUpdatedAtColumn: boolean | null = null

export async function upsertPickupRecord(record: PickupRecord) {
    const cartsVal = (record.carts !== '' && record.carts !== undefined && record.carts !== null && !isNaN(Number(record.carts)))
        ? Number(record.carts)
        : null

    const basePayload = {
        id: record.id,
        name: record.name,
        address_text: record.address_text,
        lat: record.lat,
        lng: record.lng,
        what_to_collect: record.what_to_collect,
        phone: record.phone || null,
        notes: record.notes || null,
        carts: cartsVal,
        is_urgent: record.is_urgent || false,
    }

    // If we already know updated_at doesn't exist in Supabase schema, save directly without it
    if (hasUpdatedAtColumn === false) {
        const { error } = await supabase.from('pickups').upsert(basePayload)
        if (error) {
            console.error('Error saving pickup record:', error)
            throw error
        }
        return
    }

    const payloadWithUpdate = {
        ...basePayload,
        updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('pickups').upsert(payloadWithUpdate)
    if (error) {
        // If column 'updated_at' is missing in Supabase schema, cache this and retry with basePayload
        if (error.message?.includes('updated_at') || error.code === 'PGRST204') {
            hasUpdatedAtColumn = false
            console.warn("Supabase 'pickups' table does not have 'updated_at' column. Saving without updated_at.")
            const { error: retryErr } = await supabase.from('pickups').upsert(basePayload)
            if (retryErr) {
                console.error('Error saving pickup record in retry:', retryErr)
                throw retryErr
            }
            return
        }

        console.error('Error saving pickup:', error)
        throw error
    } else {
        hasUpdatedAtColumn = true
    }
}

export async function deletePickupRecord(id: string) {
    await supabase.from('pickups').delete().eq('id', id)
}

export function newPickupRecordId(): string {
    return `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export async function markPickupDone(id: string, done: boolean, note?: string) {
    const today = todayStr()
    
    // Check if exists
    const { data: existing } = await supabase.from('pickup_completions')
        .select('id').eq('pickup_id', id).eq('date', today).maybeSingle()

    if (existing) {
        await supabase.from('pickup_completions').update({ done, note: note || null }).eq('id', existing.id)
    } else {
        await supabase.from('pickup_completions').insert({
            pickup_id: id,
            date: today,
            done,
            note: note || null
        })
    }
}

export function getTodayCompletion(record: PickupRecord): PickupCompletion | null {
    const today = todayStr()
    return record.completions.find(c => c.date === today) ?? null
}

export async function unmarkPickupDone(id: string, date: string) {
    await supabase.from('pickup_completions').delete().eq('pickup_id', id).eq('date', date)
}

export function getRecentCompletions(record: PickupRecord, limit = 10): PickupCompletion[] {
    return record.completions.slice(0, limit)
}
