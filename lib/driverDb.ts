import { supabase } from './supabase'
import type { Driver } from '@/types'

export async function getAllDrivers(): Promise<Driver[]> {
    const { data, error } = await supabase.from('drivers').select('*').order('name')
    if (error) {
        console.error('Error fetching drivers', error)
        return []
    }
    return data || []
}

export async function upsertDriver(driver: Driver) {
    const { error } = await supabase.from('drivers').upsert({
        id: driver.id,
        name: driver.name,
        truck_number: driver.truck_number
    })
    if (error) {
        throw new Error(`Failed to save driver: ${error.message}`)
    }
}

export async function deleteDriver(id: string) {
    const { error } = await supabase.from('drivers').delete().eq('id', id)
    if (error) {
        throw new Error(`Failed to delete driver: ${error.message}`)
    }
}

export function newDriverId(): string {
    return `drv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
