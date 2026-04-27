import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import type { Route } from '@/types'

const AMBER  = 'FFF59E0B'

export async function POST(req: NextRequest) {
  const { routes, date }: { routes: Route[]; date: string } = await req.json()

  const wb = new ExcelJS.Workbook()
  wb.creator = 'מערכת קווי הובלה — חגלה'
  wb.created = new Date()

  const getRoutePickupCarts = (r: Route) => r.pickups?.reduce((a, p) => a + (p.carts !== undefined && p.carts !== '' ? Number(p.carts) : 1), 0) || 0

  const sumField = (r: Route, field: 'trays' | 'carriers' | 'boxes' | 'packages_h') =>
    r.stops.reduce((a, s) => {
      const v = (s as any)[field]
      return a + (v !== undefined && v !== '' && v !== null ? Number(v) || 0 : 0)
    }, 0)

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const sum = wb.addWorksheet('סיכום', { views: [{ rightToLeft: true }] })
  sum.columns = [
    { key: 'name',       width: 18 },
    { key: 'dir',        width: 8  },
    { key: 'stops',      width: 10 },
    { key: 'trays',      width: 10 },
    { key: 'carriers',   width: 10 },
    { key: 'boxes',      width: 10 },
    { key: 'packages_h', width: 14 },
    { key: 'carts',      width: 10 },
    { key: 'pcarts',     width: 14 },
    { key: 'km',         width: 10 },
  ]

  // Title row
  const titleRow = sum.addRow([`קווי הובלה — ${date}`, '', '', '', '', '', '', '', '', ''])
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: AMBER } }
  sum.mergeCells('A1:J1')
  titleRow.height = 28
  sum.addRow([])

  // Header
  const hRow = sum.addRow(['קו', 'כיוון', 'עצירות', 'מגשים', 'מנשאים', 'ארגזים', 'אריזות ח.ריבוי', 'עגלות לחלוקה', 'עגלות לאיסוף', 'ק"מ'])
  hRow.eachCell(c => {
    c.font = { bold: true }
    c.alignment = { horizontal: 'center', readingOrder: 'rtl' }
  })

  routes.forEach(r => {
    const traysSum      = sumField(r, 'trays')
    const carriersSum   = sumField(r, 'carriers')
    const boxesSum      = sumField(r, 'boxes')
    const packages_hSum = sumField(r, 'packages_h')
    const row = sum.addRow([
      r.name, r.direction, r.stops.length,
      traysSum || '', carriersSum || '', boxesSum || '', packages_hSum || '',
      r.total_carts, getRoutePickupCarts(r), r.distance_km,
    ])
    row.eachCell(c => { c.alignment = { horizontal: 'center' } })
    row.getCell(1).font = { bold: true, color: { argb: r.color.replace('#', 'FF') } }
  })

  // Totals
  sum.addRow([])
  const totRow = sum.addRow([
    `סה"כ: ${routes.length} קווים`,
    '',
    routes.reduce((a, r) => a + r.stops.length, 0),
    routes.reduce((a, r) => a + sumField(r, 'trays'), 0)      || '',
    routes.reduce((a, r) => a + sumField(r, 'carriers'), 0)   || '',
    routes.reduce((a, r) => a + sumField(r, 'boxes'), 0)      || '',
    routes.reduce((a, r) => a + sumField(r, 'packages_h'), 0) || '',
    Math.round(routes.reduce((a, r) => a + r.total_carts, 0) * 10) / 10,
    routes.reduce((a, r) => a + getRoutePickupCarts(r), 0),
    routes.reduce((a, r) => a + r.distance_km, 0).toFixed(1),
  ])
  totRow.font = { bold: true }

  // ── One sheet per route ────────────────────────────────────────────────────
  for (const route of routes) {
    let sheetName = `${route.name}${route.isNightRoute ? ' (לילה)' : ''} - ${route.driver?.name || 'ללא נהג'}`
    // Excel sheet name max 31 chars, strip bad chars
    sheetName = sheetName.replace(/[\*\?\/\\\[\]]/g, '').substring(0, 31)

    const ws = wb.addWorksheet(sheetName, { 
      views: [{ rightToLeft: true }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.1, footer: 0.1 },
        printArea: 'A1:J200' 
      }
    })
    ws.columns = [
      { key: 'order',   width: 5  },
      { key: 'name',    width: 28 },
      { key: 'address', width: 34 },
      { key: 'trays',   width: 8  },
      { key: 'carriers',width: 8  },
      { key: 'boxes',   width: 8  },
      { key: 'packages_h',width: 14},
      { key: 'carts',   width: 8  },
      { key: 'time',    width: 16 },
      { key: 'notes',   width: 44 },
    ]

    // Route title
    const nightText = route.isNightRoute ? `  ·  🌙 קו לילה` : ''
    const driverText = route.driver ? `נהג: ${route.driver.name} (משאית: ${route.driver.truck_number})` : 'ללא נהג'
    const titleText = `${route.name}${nightText}  ·  ${driverText}  ·  ${date}`
    const rTitle = ws.addRow([titleText, '', '', '', '', '', '', '', '', ''])
    rTitle.getCell(1).font = { bold: true, size: 14 }
    rTitle.height = 24
    ws.mergeCells(`A1:J1`)

    const pCarts = getRoutePickupCarts(route)
    const pTxt = pCarts > 0 ? `  ·  ↩ ${pCarts} לאיסוף` : ''
    const summary = ws.addRow([`${route.stops.length} עצירות  ·  🛒 ${route.total_carts} לחלוקה${pTxt}  ·  ~${route.distance_km} ק"מ`, '', '', '', '', '', '', '', '', ''])
    summary.getCell(1).font = { italic: true }
    ws.mergeCells(`A2:J2`)
    ws.addRow([])

    // Column headers
    const colHead = ws.addRow(['#', 'לקוח', 'כתובת', 'מגשים', 'מנשאים', 'ארגזים', 'אריזות ח.ריבוי', 'עגלות', 'שעות', 'הערות'])
    colHead.eachCell(c => {
      c.font = { bold: true }
      c.border = { bottom: { style: 'thin', color: { argb: 'FF1E2D45' } } }
    })

    // Hagla start
    const startRow = ws.addRow(['🏠', 'מושב חגלה — יציאה', '', '', '', '', '', '', '', ''])
    startRow.getCell(1).font = { italic: true }
    startRow.getCell(2).font = { italic: true }

    // Stops
    route.stops.forEach((s) => {
      // For decimal numbers, format it to max 1 decimal place if it's not a whole number.
      let cartVal: number | string = s.carts || ''
      if (typeof cartVal === 'number' && !Number.isInteger(cartVal)) {
          cartVal = Math.round(cartVal * 10) / 10
      }

      const row = ws.addRow([
        s.cart_number || '',
        s.name,
        s.address,
        (s as any).trays || '',
        (s as any).carriers || '',
        (s as any).boxes || '',
        (s as any).packages_h || '',
        cartVal,
        s.time_window || '',
        s.notes || '',
      ])
      row.getCell(8).font = { bold: true } // carts bold
    })

    // Hagla end
    const endRow = ws.addRow(['🏠', 'מושב חגלה — חזרה', '', '', '', '', '', '', '', ''])
    endRow.getCell(1).font = { italic: true }
    endRow.getCell(2).font = { italic: true }

    // Pickups
    if (route.pickups && route.pickups.length > 0) {
      ws.addRow([])
      const pTitle = ws.addRow(['איסופים', '', '', '', '', '', '', '', '', ''])
      pTitle.getCell(1).font = { bold: true, size: 12 }
      ws.mergeCells(`A${pTitle.number}:J${pTitle.number}`)

      route.pickups.forEach((p) => {
        let pCartVal: number | string = p.carts !== undefined && p.carts !== '' && p.carts !== null ? p.carts : 1
        if (typeof pCartVal === 'number' && !Number.isInteger(pCartVal)) {
            pCartVal = Math.round(pCartVal * 10) / 10
        }

        const row = ws.addRow([
          '↩',
          p.name,
          p.address_text,
          p.what_to_collect || '',
          '', '', '',
          pCartVal,
          '',
          p.phone ? `טלפון: ${p.phone} ${p.notes ? ' | ' + p.notes : ''}` : (p.notes || ''),
        ])
        ws.mergeCells(`D${row.number}:G${row.number}`)
        row.getCell(8).font = { bold: true }
      })
    }

    // ── Driver Fillable Form Sheet ─────────────────────────────────────────────
    let formSheetName = `טופס - ${sheetName}`
    formSheetName = formSheetName.substring(0, 31)

    const formWs = wb.addWorksheet(formSheetName, { 
      views: [{ rightToLeft: true }],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.1, footer: 0.1 },
        printArea: 'A1:H200' 
      }
    })

    formWs.columns = [
      { key: 'order',   width: 5  },
      { key: 'name',    width: 32 },
      { key: 'trays',   width: 12 },
      { key: 'carriers',width: 12 },
      { key: 'boxes',   width: 12 },
      { key: 'packages_h',width: 16},
      { key: 'carts',   width: 12 },
      { key: 'sign',    width: 25 },
    ]

    const fTitle = formWs.addRow([`טופס איסוף נהג  ·  ${titleText}`, '', '', '', '', '', '', ''])
    fTitle.getCell(1).font = { bold: true, size: 14 }
    fTitle.height = 24
    formWs.mergeCells(`A1:H1`)
    formWs.addRow([])

    const fHead = formWs.addRow(['#', 'לקוח', 'מגשים', 'מנשאים', 'ארגזים', 'אריזות ח.ריבוי', 'עגלות', 'חתימת לקוח/הערות'])
    fHead.eachCell(c => {
      c.font = { bold: true }
      c.border = { bottom: { style: 'thin', color: { argb: 'FF1E2D45' } } }
    })

    route.stops.forEach((s) => {
      const row = formWs.addRow([
        s.cart_number || '',
        s.name,
        '', '', '', '', '', '' // empty for driver to fill
      ])
      // add standard row height for writing
      row.height = 30
      row.eachCell(c => {
        c.border = { bottom: { style: 'dotted', color: { argb: 'FFCCCCCC' } } }
        c.alignment = { vertical: 'middle' }
      })
    })

    if (route.pickups && route.pickups.length > 0) {
      formWs.addRow([])
      const fpTitle = formWs.addRow(['איסופים מיוחדים', '', '', '', '', '', '', ''])
      fpTitle.getCell(1).font = { bold: true, size: 12 }
      formWs.mergeCells(`A${fpTitle.number}:H${fpTitle.number}`)

      route.pickups.forEach((p) => {
        const row = formWs.addRow([
          '↩',
          p.name,
          '', '', '', '', '', ''
        ])
        row.height = 30
        row.eachCell(c => {
          c.border = { bottom: { style: 'dotted', color: { argb: 'FFCCCCCC' } } }
          c.alignment = { vertical: 'middle' }
        })
      })
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `קווים-${date.replace(/\//g, '-')}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
