import { NextRequest, NextResponse } from 'next/server'
import { buildRoutes, assignPickups } from '@/lib/routing'
import type { Stop, PickupRecord } from '@/types'

/**
 * POST /api/routes
 * Body: { stops: Stop[], numTrucks: number, pickups?: PickupRecord[], selectedPickupIds?: string[] }
 * Pickups are assigned to nearest routes and do NOT count toward cart limit.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const stops: Stop[] = body.stops ?? []
    const pickups: PickupRecord[] = body.pickups ?? []
    const selectedIds: string[] = body.selectedPickupIds ?? []
    const numTrucks = Math.max(1, parseInt(body.numTrucks) || 7)

    if (!stops.length) {
      return NextResponse.json({ error: 'לא נשלחו עצירות' }, { status: 400 })
    }

    const noAddress = stops.filter(s => !s.lat || !s.lng).map(s => s.name)
    const withCoords = stops.filter(s => s.lat && s.lng)

    let routes = buildRoutes(withCoords, numTrucks)

    // Filter to selected pickups that have coordinates
    const selectedPickups = pickups.filter(p =>
      selectedIds.includes(p.id) && p.lat !== null && p.lng !== null
    )
    if (selectedPickups.length > 0) {
      routes = assignPickups(routes, selectedPickups)
    }

    return NextResponse.json({
      routes,
      total_customers: stops.length,
      total_carts: Math.round(stops.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10,
      no_address: noAddress,
      date: new Date().toLocaleDateString('he-IL'),
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message || 'שגיאת שרת' }, { status: 500 })
  }
}
