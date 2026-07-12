import { SETTLEMENTS } from './locations'

// ─── In-memory cache (successful results only) ────────────────────────────────
const cache = new Map<string, [number, number]>()

/** Normalise string for consistent lookup */
function normalise(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/[״"]/g, '"').replace(/[׳'`]/g, "'").toLowerCase()
}

// ─── Strategy 0: local settlement dictionary ───────────────────────────────────
// Scans the address for any known settlement name (longest match wins).
function lookupLocal(address: string): [number, number] | null {
  const norm = normalise(address)
  // Try longest match first so "כפר חסידים א" beats "כפר חסידים"
  const keys = Object.keys(SETTLEMENTS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (norm.includes(normalise(key))) {
      return SETTLEMENTS[key]
    }
  }
  return null
}

// ─── Israel bounding box for Nominatim viewbox bias ───────────────────────────
const ISRAEL_VIEWBOX = '34.2,33.5,35.9,29.4'

/** Single Nominatim request — no caching or rate-limit logic */
async function nominatim(q: string): Promise<[number, number] | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search` +
      `?q=${encodeURIComponent(q)}` +
      `&format=json&limit=3&countrycodes=il` +
      `&viewbox=${ISRAEL_VIEWBOX}&bounded=0`
    const r = await fetch(url, { headers: { 'User-Agent': 'HaglaRouteApp/2.0' } })
    if (!r.ok) return null
    const data = await r.json() as any[]
    if (!data?.length) return null
    // Pick most precise result (smallest bounding box)
    const best = data.reduce((a, b) => {
      const area = (d: any) =>
        (parseFloat(d.boundingbox[1]) - parseFloat(d.boundingbox[0])) *
        (parseFloat(d.boundingbox[3]) - parseFloat(d.boundingbox[2]))
      return area(a) <= area(b) ? a : b
    })
    return [parseFloat(best.lat), parseFloat(best.lon)]
  } catch { return null }
}

async function googleGeocode(q: string): Promise<[number, number] | null> {
  try {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return null
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}&region=il&language=iw`
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json()
    if (data.status === 'OK' && data.results.length > 0) {
      const loc = data.results[0].geometry.location
      return [loc.lat, loc.lng]
    }
    return null
  } catch { return null }
}

async function externalGeocode(q: string): Promise<[number, number] | null> {
  const gCoords = await googleGeocode(q)
  if (gCoords) return gCoords
  return await nominatim(q)
}

/** Return just the settlement part (text after first comma, or last meaningful word group) */
function extractSettlement(address: string): string {
  // "שדרות האקליפטוס 18, בוסתן בגליל" → "בוסתן בגליל"
  const commaIdx = address.indexOf(',')
  if (commaIdx > 0) {
    const after = address.slice(commaIdx + 1).trim()
    if (after) return after
  }
  // Remove leading street-type word and house number, return rest
  return address
    .replace(/^(רח'?\.?|שד'?\.?|דרך|כביש|סמטת?|שכונת?)\s+/i, '')
    .replace(/^\d+\s+/, '')
    .replace(/\s+\d+$/, '')
    .replace(/\s+\d+[א-ת]?$/, '')
    .trim()
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const DELAY = 1200   // Nominatim: max 1 req/s

// ─── Public API ───────────────────────────────────────────────────────────────

/** Geocode a single address (cache-first, single Nominatim attempt). */
export async function geocode(address: string): Promise<[number, number] | null> {
  const key = normalise(address)
  if (cache.has(key)) return cache.get(key)!
  // Try local dictionary first
  const local = lookupLocal(address)
  if (local) { cache.set(key, local); return local }
  // Fall back to external
  const coords = await externalGeocode(address + ', ישראל')
  if (coords) cache.set(key, coords)
  return coords
}

/**
 * Batch-geocode with rate-limiting and 4-strategy fallback.
 * Strategy order:
 *   0. Local settlement dictionary (instant, no API call)
 *   1. Full address + ישראל  → Nominatim
 *   2. Settlement extracted from address → Nominatim
 *   3. Just the first comma-segment → Nominatim
 *   4. Raw address without country suffix → Nominatim
 */
export async function geocodeBatch(
  stops: { address: string }[]
): Promise<Map<string, [number, number] | null>> {

  const result = new Map<string, [number, number] | null>()

  // Deduplicate by normalised address
  const normToOriginal = new Map<string, string>()
  for (const s of stops) {
    if (!s.address) continue
    const norm = normalise(s.address)
    if (!normToOriginal.has(norm)) normToOriginal.set(norm, s.address)
  }

  const coordsByNorm = new Map<string, [number, number] | null>()

  for (const [norm, original] of normToOriginal) {
    // Session cache hit
    if (cache.has(norm)) { coordsByNorm.set(norm, cache.get(norm)!); continue }

    // ── Strategy 0: local dictionary (no network) ─────────────────────────
    let coords: [number, number] | null = lookupLocal(original)
    if (coords) { cache.set(norm, coords); coordsByNorm.set(norm, coords); continue }

    // ── Strategy 1: full address + ישראל ─────────────────────────────────
    coords = await externalGeocode(original.trim() + ', ישראל')
    await sleep(DELAY)

    // ── Strategy 2: extracted settlement ─────────────────────────────────
    if (!coords) {
      const settlement = extractSettlement(original)
      if (normalise(settlement) !== norm) {
        // Also try local dictionary on extracted settlement
        coords = lookupLocal(settlement) ?? await externalGeocode(settlement + ', ישראל')
        if (!lookupLocal(settlement)) await sleep(DELAY)
      }
    }

    // ── Strategy 3: first comma-segment ──────────────────────────────────
    if (!coords && original.includes(',')) {
      const first = original.split(',')[0].trim()
      if (normalise(first) !== norm) {
        coords = lookupLocal(first) ?? await externalGeocode(first + ', ישראל')
        if (!lookupLocal(first)) await sleep(DELAY)
      }
    }

    // ── Strategy 4: raw (no country suffix) ──────────────────────────────
    if (!coords) {
      coords = await externalGeocode(original.trim())
      await sleep(DELAY)
    }

    if (coords) cache.set(norm, coords)
    coordsByNorm.set(norm, coords)
  }

  // Map every original address back to its coords (including duplicates)
  for (const s of stops) {
    if (!s.address) continue
    result.set(s.address, coordsByNorm.get(normalise(s.address)) ?? null)
  }

  return result
}
