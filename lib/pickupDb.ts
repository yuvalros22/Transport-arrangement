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

export async function upsertPickupRecord(record: PickupRecord) {
    const payload = {
        id: record.id,
        name: record.name,
        address_text: record.address_text,
        lat: record.lat,
        lng: record.lng,
        what_to_collect: record.what_to_collect,
        phone: record.phone || null,
        notes: record.notes || null,
        carts: record.carts || null,
        is_urgent: record.is_urgent || false,
    }

    const { error } = await supabase.from('pickups').upsert(payload)
    if (error) {
        console.error('Error saving pickup (will try fallback without carts):', error)
        try {
            delete (payload as any).carts
            delete (payload as any).phone
            delete (payload as any).notes
            delete (payload as any).is_urgent
            await supabase.from('pickups').upsert(payload)
        } catch (e) {
            console.error('Exception in pickup fallback:', e)
        }
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
