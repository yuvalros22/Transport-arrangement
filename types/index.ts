// ─── Routing types ────────────────────────────────────────────────────────────
export interface Stop {
  name: string
  address: string
  carts: number | string
  trays?: number | string
  carriers?: number | string
  boxes?: number | string
  packages_h?: number | string
  cart_number: string
  time_from: string
  time_to: string
  notes: string
  lat: number | null
  lng: number | null
  // pickup-specific (optional — only set when isPickup=true)
  isPickup?: boolean
  what_to_collect?: string
  phone?: string
}

export interface RouteStop extends Stop {
  order: number
  time_window: string
}

export interface Route {
  id: number
  name: string
  direction: string
  color: string
  stops: RouteStop[]
  pickups: RoutePickup[]   // pickup stops assigned to this route
  total_carts: number
  distance_km: number
  driver?: Driver
  isNightRoute?: boolean
}

export interface Driver {
  id: string
  name: string
  truck_number: string
}

export interface RoutesResult {
  routes: Route[]
  total_customers: number
  total_carts: number
  no_address: string[]
  date: string
}

// ─── Pickup types ─────────────────────────────────────────────────────────────

/** One completion record — created each time a pickup is marked done */
export interface PickupCompletion {
  date: string        // "YYYY-MM-DD"
  done: boolean       // true = done, false = not done
  note?: string
}

/** Permanent pickup record in the DB */
export interface PickupRecord {
  id: string
  name: string
  address_text: string
  lat: number | null
  lng: number | null
  what_to_collect: string
  phone?: string
  notes?: string
  carts?: number | string
  is_urgent?: boolean
  completions: PickupCompletion[]   // history, newest first
}

/** Used only in routing session (includes today's selected state) */
export interface Pickup {
  id: string
  name: string
  address_text: string
  lat: number | null
  lng: number | null
  what_to_collect: string
  phone?: string
  notes?: string
  carts?: number | string
  selected: boolean         // include in today's routing
}

export interface RoutePickup {
  id: string
  name: string
  address_text: string
  lat: number
  lng: number
  what_to_collect: string
  phone?: string
  notes?: string
  carts?: number | string
  order: number             // position in route (inserted by proximity)
}


// ─── Customer database types ──────────────────────────────────────────────────
export interface CustomerAddress {
  id: string           // uuid
  label: string        // e.g. "כתובת ראשית", "סניף צפון"
  address_text: string // display text
  lat: number
  lng: number
}

export interface Customer {
  code: string          // unique customer code from Excel
  name: string
  addresses: CustomerAddress[]
  time_from?: string
  time_to?: string
  notes?: string
}

// ─── Review screen (intermediate) types ───────────────────────────────────────
export interface ReviewEntry {
  code: string
  name: string
  carts: number | string
  trays?: number | string
  carriers?: number | string
  boxes?: number | string
  packages_h?: number | string
  cart_number: string
  time_from: string
  time_to: string
  notes: string
  // resolved address (either from DB or just set)
  lat: number | null
  lng: number | null
  address_text: string
  address_label: string
  // flags
  isKnown: boolean      // found in customer DB
  needsAddress: boolean // no coords yet
  isManual: boolean     // manually added (not from Excel)
  isCancelled?: boolean // user removed it for today
  // if customer has multiple addresses, user can pick
  availableAddresses: CustomerAddress[]
}
