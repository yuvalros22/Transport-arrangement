import type { Stop, Route, RouteStop, PickupRecord, RoutePickup } from '@/types'

export const HAGLA = { lat: 32.38639, lng: 34.92667 }
export const MAX_CARTS = 18
export const COLORS = [
  '#ef4444', '#3b82f6', '#f59e0b', '#10b981',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  '#84cc16', '#f43f5e',
]

// ─── Geo helpers ──────────────────────────────────────────────────────────────

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371, p = Math.PI / 180
  const a = Math.sin((lat2 - lat1) * p / 2) ** 2
    + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin((lng2 - lng1) * p / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Clockwise angle from Hagla (north = 0°)
function angleDeg(s: Stop): number {
  const dy = (s.lat ?? HAGLA.lat) - HAGLA.lat
  const dx = (s.lng ?? HAGLA.lng) - HAGLA.lng
  const a = Math.atan2(dx, dy) * 180 / Math.PI
  return a < 0 ? a + 360 : a
}

function centroid(stops: Stop[]) {
  const n = stops.length || 1
  return {
    lat: stops.reduce((s, x) => s + (x.lat ?? HAGLA.lat), 0) / n,
    lng: stops.reduce((s, x) => s + (x.lng ?? HAGLA.lng), 0) / n,
  }
}

// A stop is "north" if its latitude is above Hagla
const isNorthStop = (s: {lat?: number | null}) => (s.lat ?? HAGLA.lat) >= HAGLA.lat

// ─── Time helpers ─────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  if (!t) return 9999
  const [h, m] = t.split(':').map(Number)
  return isNaN(h) ? 9999 : h * 60 + (m || 0)
}

function timeWindow(s: Stop): string {
  if (s.time_from && s.time_to) return `${s.time_from}–${s.time_to}`
  if (s.time_from) return `מ-${s.time_from}`
  if (s.time_to) return `עד ${s.time_to}`
  return ''
}

// ─── Nearest-neighbour TSP within one truck ───────────────────────────────────

function nearestNeighbor(stops: Stop[]): Stop[] {
  if (stops.length <= 1) return stops
  const rem = [...stops]
  const ordered: Stop[] = []
  let clat = HAGLA.lat, clng = HAGLA.lng
  while (rem.length) {
    let bi = 0, bd = Infinity
    rem.forEach((s, i) => {
      const d = haversine(clat, clng, s.lat ?? clat, s.lng ?? clng)
      if (d < bd) { bd = d; bi = i }
    })
    const next = rem.splice(bi, 1)[0]
    ordered.push(next)
    clat = next.lat ?? clat
    clng = next.lng ?? clng
  }
  return ordered
}

function routeKm(stops: Stop[]): number {
  const pts = [HAGLA, ...stops.map(s => ({ lat: s.lat ?? HAGLA.lat, lng: s.lng ?? HAGLA.lng })), HAGLA]
  let d = 0
  for (let i = 0; i < pts.length - 1; i++)
    d += haversine(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng)
  return Math.round(d * 10) / 10
}

// ─── Balanced K-way angular partition ────────────────────────────────────────
// Sorts stops by angle, then sweeps filling K buckets to ~totalCarts/K each.
// Hard limit: never exceed MAX_CARTS in one bucket.

function partitionByAngle(stops: Stop[], K: number): Stop[][] {
  if (!stops.length || K <= 0) return []
  K = Math.max(1, K)

  const sorted = [...stops].sort((a, b) => angleDeg(a) - angleDeg(b))
  const totalCarts = Math.round(sorted.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10
  const target = totalCarts / K          // ideal load per bucket

  const groups: Stop[][] = [[]]
  let load = 0
  let slotsLeft = K

  for (const stop of sorted) {
    const wouldOverflow = Math.round((load + Number(stop.carts)) * 10) / 10 > MAX_CARTS
    const hitTarget = load >= target && slotsLeft > 1

    if (wouldOverflow || hitTarget) {
      groups.push([])
      load = 0
      slotsLeft = Math.max(1, slotsLeft - 1)
    }
    // Safety: still overflow on a fresh bucket (single stop > 18 carts – rare)
    if (Math.round((load + Number(stop.carts)) * 10) / 10 > MAX_CARTS) { groups.push([]); load = 0 }

    groups[groups.length - 1].push(stop)
    load = Math.round((load + Number(stop.carts)) * 10) / 10
  }

  return groups.filter(g => g.length > 0)
}

// ─── Merge adjacent under-loaded routes ───────────────────────────────────────

interface Truck { stops: Stop[]; load: number; dir: 'צפון' | 'דרום' }

function mergeUnderloaded(trucks: Truck[]): Truck[] {
  // Sort by centroid angle so adjacent = geographically adjacent
  trucks.sort((a, b) => {
    const ca = centroid(a.stops)
    const cb = centroid(b.stops)
    const fa = Math.atan2(ca.lng - HAGLA.lng, ca.lat - HAGLA.lat)
    const fb = Math.atan2(cb.lng - HAGLA.lng, cb.lat - HAGLA.lat)
    return fa - fb
  })

  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < trucks.length - 1; i++) {
      const a = trucks[i], b = trucks[i + 1]
      // Never merge north and south routes
      if (a.dir !== b.dir) continue
      if (Math.round((a.load + b.load) * 10) / 10 > MAX_CARTS) continue

      trucks[i] = { stops: [...a.stops, ...b.stops], load: Math.round((a.load + b.load) * 10) / 10, dir: a.dir }
      trucks.splice(i + 1, 1)
      changed = true
      break
    }
  }
  return trucks
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function buildRoutes(stops: Stop[], numTrucks: number): Route[] {
  if (!stops.length) return []

  const withCoords = stops.filter(s => s.lat && s.lng)
  const noCoords = stops.filter(s => !s.lat || !s.lng)

  // ── Step 1: hard north/south split (never mix) ────────────────────────────
  const northStops = withCoords.filter(isNorthStop)
  const southStops = withCoords.filter(s => !isNorthStop(s))

  const totalCarts = Math.round(stops.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10
  const northCarts = Math.round(northStops.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10
  const southCarts = Math.round(southStops.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10

  // Minimum trucks forced by capacity
  const minNeeded = Math.max(1, Math.ceil(totalCarts / MAX_CARTS))
  const K = Math.min(numTrucks, Math.max(minNeeded, 1))

  // Apportion trucks proportionally; each side gets at least 1 if it has stops
  let kNorth = northStops.length ? Math.max(1, Math.round(K * northCarts / (totalCarts || 1))) : 0
  let kSouth = southStops.length ? Math.max(1, K - kNorth) : 0
  // If one side is empty, give all slots to the other
  if (!northStops.length) { kNorth = 0; kSouth = K }
  if (!southStops.length) { kSouth = 0; kNorth = K }

  // ── Step 2: partition each group by angle ─────────────────────────────────
  const northGroups = partitionByAngle(northStops, kNorth)
  const southGroups = partitionByAngle(southStops, kSouth)

  const toTruck = (g: Stop[], dir: 'צפון' | 'דרום'): Truck =>
    ({ stops: g, load: Math.round(g.reduce((a, s) => a + Number(s.carts), 0) * 10) / 10, dir })

  let trucks: Truck[] = [
    ...northGroups.map(g => toTruck(g, 'צפון')),
    ...southGroups.map(g => toTruck(g, 'דרום')),
  ]

  // ── Step 3: assign no-coord stops to best-fitting truck ──────────────────
  for (const stop of noCoords) {
    const best = trucks
      .filter(t => Math.round((t.load + Number(stop.carts)) * 10) / 10 <= MAX_CARTS)
      .sort((a, b) => b.load - a.load)[0]
    if (best) { best.stops.push(stop); best.load = Math.round((best.load + Number(stop.carts)) * 10) / 10 }
    else { trucks.push({ stops: [stop], load: Math.round(Number(stop.carts) * 10) / 10, dir: 'דרום' }) }
  }

  // ── Step 4: merge under-loaded adjacent routes (north and south separately)
  const north = mergeUnderloaded(trucks.filter(t => t.dir === 'צפון'))
  const south = mergeUnderloaded(trucks.filter(t => t.dir === 'דרום'))
  trucks = [...north, ...south]

  // ── Step 5: order stops within each truck ────────────────────────────────
  // Urgent (time_to ≤ 08:00) first, then nearest-neighbour TSP
  trucks = trucks.map(t => {
    const EARLY = 8 * 60
    const urgent = t.stops.filter(s => timeToMin(s.time_to) <= EARLY)
    const rest = t.stops.filter(s => timeToMin(s.time_to) > EARLY)
    return { stops: [...nearestNeighbor(urgent), ...nearestNeighbor(rest)], load: t.load, dir: t.dir }
  })

  // ── Step 6: build Route objects ───────────────────────────────────────────
  const routes: Route[] = trucks.map((t, idx) => {
    const rs: RouteStop[] = t.stops.map((s, j) => ({ ...s, order: j + 1, time_window: timeWindow(s) }))
    return {
      id: idx + 1,
      name: '',
      direction: t.dir,
      color: COLORS[idx % COLORS.length],
      stops: rs,
      pickups: [],
      total_carts: t.load,
      distance_km: routeKm(t.stops),
    }
  })

  // ── Step 7: sort and label ────────────────────────────────────────────────
  routes.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'צפון' ? -1 : 1
    return a.distance_km - b.distance_km
  })

  let nN = 1, nS = 1
  routes.forEach((r, i) => {
    r.id = i + 1
    r.name = r.direction === 'צפון' ? `קו צפון ${nN++}` : `קו דרום ${nS++}`
  })

  return routes
}

// ─── Assign pickups to nearest route ─────────────────────────────────────────────
/**
 * Assign already-selected pickups to the nearest route.
 * Expects only pickups that are selected AND have lat/lng.
 * Pickups do NOT count toward the cart limit.
 */
export function assignPickups(routes: Route[], pickups: PickupRecord[]): Route[] {
  const withCoords = pickups.filter(p => p.lat !== null && p.lng !== null)
  if (!withCoords.length) return routes

  // Deep-clone routes so we don't mutate
  const result: Route[] = routes.map(r => ({
    ...r,
    stops: r.stops.map(s => ({ ...s })),
    pickups: [...r.pickups],
  }))

  withCoords.forEach(pickup => {
    const pDir = (pickup.lat ?? HAGLA.lat) >= HAGLA.lat ? 'צפון' : 'דרום'
    
    // Find the route with the closest stop to this pickup, matching direction
    let bestRouteIdx = -1
    let bestDist = Infinity

    result.forEach((route, ri) => {
      if (route.direction !== pDir) return
      route.stops.forEach(stop => {
        if (!stop.lat || !stop.lng) return
        const d = haversine(pickup.lat!, pickup.lng!, stop.lat, stop.lng)
        if (d < bestDist) { bestDist = d; bestRouteIdx = ri }
      })
    })

    // Fallback if no routes in that direction exist
    if (bestRouteIdx === -1) {
      result.forEach((route, ri) => {
        route.stops.forEach(stop => {
          if (!stop.lat || !stop.lng) return
          const d = haversine(pickup.lat!, pickup.lng!, stop.lat, stop.lng)
          if (d < bestDist) { bestDist = d; bestRouteIdx = ri }
        })
      })
    }
    
    // Failsafe if absolutely no stops have coords in any route
    if (bestRouteIdx === -1) bestRouteIdx = 0

    const rp: RoutePickup = {
      id: pickup.id,
      name: pickup.name,
      address_text: pickup.address_text,
      lat: pickup.lat!,
      lng: pickup.lng!,
      what_to_collect: pickup.what_to_collect,
      phone: pickup.phone,
      notes: pickup.notes,
      carts: pickup.carts,
      order: result[bestRouteIdx].pickups.length + 1,
    }
    result[bestRouteIdx].pickups.push(rp)
  })

  return result
}
