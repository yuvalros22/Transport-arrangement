import * as XLSX from 'xlsx'
import type { Stop } from '@/types'

function parseTime(val: unknown): string {
  if (val === null || val === undefined || val === '') return ''
  const s = String(val).trim()
  if (!s || s === 'nan') return ''
  if (/^\d{1,2}:\d{2}/.test(s)) return s.split(/[-–]/)[0].trim()
  const n = parseFloat(s)
  if (!isNaN(n) && n > 0 && n < 1) {
    const mins = Math.round(n * 1440)
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
  }
  return ''
}

function clean(val: unknown): string {
  if (!val) return ''
  const s = String(val).trim()
  return ['nan', 'undefined', 'null'].includes(s) ? '' : s
}

export interface ParsedRow extends Stop {
  code: string  // customer code (from column or derived from name)
}

export function parseExcel(buffer: ArrayBuffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (rows.length < 2) return []

  const headers = (rows[0] as string[]).map(h => String(h ?? '').trim().toLowerCase())
  const col: Record<string, number> = {}
  let colTrays: number | undefined
  let colCarriers: number | undefined
  let colBoxes: number | undefined
  let colPackagesH: number | undefined
  let colCartNum: number | undefined

  headers.forEach((h, i) => {
    const hClean = h.replace(/['"\s`_.-]/g, '')
    if (colCartNum === undefined && (hClean.includes('מסעגלה') || hClean.includes('מספרעגלה'))) colCartNum = i
    else if (col.carts === undefined && /עגלה|עגלות|cart|^כמות$|^qty$|^quantity$/i.test(h)) col.carts = i

    if (col.code === undefined && /קוד|code|מזהה|id/.test(h)) col.code = i
    if (col.name === undefined && /שם|name|לקוח|customer/.test(h)) col.name = i
    if (col.address === undefined && /כתובת|address|רחוב/.test(h)) col.address = i
    if (col.from === undefined && /החל|from|time_from|מ.?שעה|משעה/.test(h)) col.from = i
    if (col.to === undefined && /עד.?שעה|time_to|until|לשעה/.test(h)) col.to = i
    if (col.notes === undefined && /הערה|note|הערות/.test(h)) col.notes = i
    if (col.dir === undefined && /כיוון|direction/.test(h)) col.dir = i

    if (colTrays === undefined && /מגש/i.test(h)) colTrays = i
    if (colCarriers === undefined && /מנשא/i.test(h)) colCarriers = i
    if (colBoxes === undefined && /ארגז/i.test(h)) colBoxes = i
    if (colPackagesH === undefined && /אריז|ח[.\/]ריבוי|ריבוי/i.test(h)) colPackagesH = i
  })

  if (col.name === undefined) throw new Error('לא נמצאה עמודת שם לקוח')

  const codeToName = new Map<string, string>()
  const codeCount = new Map<string, number>()  // tracks how many times we've seen each base code
  const stops: ParsedRow[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const name = clean(row[col.name])
    if (!name) continue

    const rawCode = col.code !== undefined ? clean(row[col.code]) : ''
    // Fallback: normalise the name as code
    let code = rawCode || name.trim().toLowerCase().replace(/\s+/g, '_')

    // Disambiguate if same code appears for different names
    const existing = codeToName.get(code)
    if (existing && existing !== name.trim().toLowerCase()) {
      code = `${code}_${name.trim().toLowerCase().replace(/\s+/g, '_')}`
    }
    codeToName.set(code, name.trim().toLowerCase())

    // If the same customer appears more than once, give each row a unique code
    // Use the cart number to uniquely identify different carts for the same customer.
    // If cart number is missing or repeated, use a counter.
    const cartNumVal = colCartNum !== undefined ? clean(row[colCartNum]) : ''
    const baseCodeKey = cartNumVal ? `${code}__cart_${cartNumVal}` : code
    
    const seen = codeCount.get(baseCodeKey) ?? 0
    codeCount.set(baseCodeKey, seen + 1)
    
    if (cartNumVal) {
      // If there's a cart number, code is always baseCodeKey (plus counter if duplicate carts)
      code = seen === 0 ? baseCodeKey : `${baseCodeKey}__${seen}`
    } else {
      // If no cart number, fallback to generic counter
      if (seen > 0) code = `${code}__${seen}`
    }

    const cartsRaw = col.carts !== undefined ? row[col.carts] : ''
    let cartsNum = 0
    if (cartsRaw !== '') {
      cartsNum = parseFloat(String(cartsRaw))
      if (isNaN(cartsNum)) cartsNum = 0
      cartsNum = Math.max(0, Math.round(cartsNum * 10) / 10)
    }

    const parsePkgStr = (idx: number | undefined) => {
      if (idx === undefined) return ''
      const v = clean(row[idx])
      if (!v || v === '0') return ''
      return v.endsWith('.0') ? v.slice(0, -2) : v
    }

    stops.push({
      code,
      name,
      address: col.address !== undefined ? clean(row[col.address]) : '',
      carts: cartsNum,
      trays: parsePkgStr(colTrays),
      carriers: parsePkgStr(colCarriers),
      boxes: parsePkgStr(colBoxes),
      packages_h: parsePkgStr(colPackagesH),
      cart_number: colCartNum !== undefined ? clean(row[colCartNum]) : '',
      time_from: col.from !== undefined ? parseTime(row[col.from]) : '',
      time_to: col.to !== undefined ? parseTime(row[col.to]) : '',
      notes: col.notes !== undefined ? clean(row[col.notes]) : '',
      lat: null,
      lng: null,
    })
  }
  return stops
}

