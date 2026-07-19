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

  const borderAll: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } }
  }

  sum.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.1, footer: 0.1 }
  }

  // Header
  const hRow = sum.addRow(['קו', 'כיוון', 'עצירות', 'מגש 7', 'מנשא 18', 'BOX', 'אריזות ח.ריבוי', 'עגלות לחלוקה', 'עגלות לאיסוף', 'ק"מ'])
  hRow.eachCell(c => {
    c.font = { bold: true }
    c.alignment = { horizontal: 'center', readingOrder: 'rtl' }
    c.border = borderAll
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
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
    row.eachCell({ includeEmpty: true }, c => { 
      c.alignment = { horizontal: 'center' } 
      c.border = borderAll
    })
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
  totRow.eachCell({ includeEmpty: true }, c => c.border = borderAll)
  sum.pageSetup.printArea = `A1:J${sum.rowCount}`

  // ── One sheet per route ────────────────────────────────────────────────────
  for (const route of routes) {
    let baseSheetName = `${route.name}${route.isNightRoute ? ' (לילה)' : ''} - ${route.driver?.name || 'ללא נהג'}`
    baseSheetName = baseSheetName.replace(/[\*\?\/\\\[\]]/g, '')

    for (let i = 1; i <= 2; i++) {
      let sheetName = i === 1 ? baseSheetName.substring(0, 31) : `${baseSheetName.substring(0, 24)} - עותק`
      
      const ws = wb.addWorksheet(sheetName, { 
        views: [{ rightToLeft: true }],
        pageSetup: {
          orientation: 'landscape',
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: { left: 0.2, right: 0.2, top: 0.4, bottom: 0.4, header: 0.1, footer: 0.1 }
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
      const colHead = ws.addRow(['#', 'לקוח', 'כתובת', 'מגש 7', 'מנשא 18', 'BOX', 'אריזות ח.ריבוי', 'עגלות', 'שעות', 'הערות'])
      colHead.eachCell(c => {
        c.font = { bold: true }
        c.border = borderAll
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
      })

      // Hagla start
      const startRow = ws.addRow(['🏠', 'מושב חגלה — יציאה', '', '', '', '', '', '', '', ''])
      startRow.getCell(1).font = { italic: true }
      startRow.getCell(2).font = { italic: true }
      startRow.eachCell({ includeEmpty: true }, c => c.border = borderAll)

      // Stops
      route.stops.forEach((s) => {
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
        row.eachCell({ includeEmpty: true }, c => c.border = borderAll)
      })

      // Totals row
      const totalTrays = sumField(route, 'trays')
      const totalCarriers = sumField(route, 'carriers')
      const totalBoxes = sumField(route, 'boxes')
      const totalPackagesH = sumField(route, 'packages_h')
      const totalCarts = route.total_carts

      const totRow = ws.addRow([
        '',
        'סה"כ',
        '',
        totalTrays || '',
        totalCarriers || '',
        totalBoxes || '',
        totalPackagesH || '',
        totalCarts || '',
        '',
        ''
      ])
      totRow.eachCell({ includeEmpty: true }, c => {
        c.font = { bold: true }
        c.border = borderAll
      })

      // Hagla end
      const endRow = ws.addRow(['🏠', 'מושב חגלה — חזרה', '', '', '', '', '', '', '', ''])
      endRow.getCell(1).font = { italic: true }
      endRow.getCell(2).font = { italic: true }
      endRow.eachCell({ includeEmpty: true }, c => c.border = borderAll)

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
          row.eachCell({ includeEmpty: true }, c => c.border = borderAll)
        })
      }

      ws.pageSetup.printArea = `A1:J${ws.rowCount}`
    }

    // ── Driver Fillable Form Sheet ─────────────────────────────────────────────
    let formSheetName = `טופס - ${baseSheetName.substring(0, 24)}`

    const formWs = wb.addWorksheet(formSheetName, { 
      views: [{ rightToLeft: true }],
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.1, footer: 0.1 }
      }
    })

    formWs.columns = [
      { key: 'order',              width: 5  },
      { key: 'name',               width: 32 },
      { key: 'carts',              width: 12 },
      { key: 'trays',              width: 12 },
      { key: 'carriers',           width: 12 },
      { key: 'boxes',              width: 12 },
      { key: 'packages_h',         width: 16 },
      { key: 'carts_left',         width: 16 },
      { key: 'concessions_trays',  width: 15 },
      { key: 'concessions_carriers',width: 15 },
      { key: 'concessions_boxes',   width: 15 },
      { key: 'returns',            width: 12 },
    ]

    const nightText = route.isNightRoute ? `  ·  🌙 קו לילה` : ''
    const driverText = route.driver ? `נהג: ${route.driver.name} (משאית: ${route.driver.truck_number})` : 'ללא נהג'
    const titleText = `${route.name}${nightText}  ·  ${driverText}  ·  ${date}`

    const fTitle = formWs.addRow([`טופס איסוף נהג  ·  ${titleText}`])
    fTitle.getCell(1).font = { bold: true, size: 14 }
    fTitle.height = 24
    formWs.mergeCells(`A1:L1`)
    formWs.addRow([])

    const fHead = formWs.addRow([
      '#',
      'לקוח',
      'עגלות',
      'מגש 7',
      'מנשא 18',
      'BOX',
      'אריזות ח.ריבוי',
      'עגלות שנשארו',
      'ויתורים מגש 7',
      'ויתורים מנשא 18',
      'ויתורים BOX',
      'חזרות'
    ])
    fHead.eachCell(c => {
      c.font = { bold: true }
      c.border = borderAll
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    })

    route.stops.forEach((s) => {
      const row = formWs.addRow([
        s.cart_number || '',
        s.name,
        '', '', '', '', '', '', '', '', '', ''
      ])
      row.height = 30
      row.eachCell({ includeEmpty: true }, c => {
        c.border = borderAll
        c.alignment = { vertical: 'middle' }
      })
    })

    // Always render the Special Pickups ("איסופים מיוחדים") section header and divider
    formWs.addRow([])
    const fpTitle = formWs.addRow(['איסופים מיוחדים'])
    fpTitle.getCell(1).font = { bold: true, size: 12 }
    formWs.mergeCells(`A${fpTitle.number}:L${fpTitle.number}`)

    // Render automatic pickups if they exist
    if (route.pickups && route.pickups.length > 0) {
      route.pickups.forEach((p) => {
        const row = formWs.addRow([
          '↩',
          p.name,
          '', '', '', '', '', '', '', '', '', ''
        ])
        row.height = 30
        row.eachCell({ includeEmpty: true }, c => {
          c.border = borderAll
          c.alignment = { vertical: 'middle' }
        })
      })
    }

    // Now calculate the empty padding rows to fill the remaining print page nicely
    const titleAndHeaderHeight = 60
    const stopHeight = 30
    const pickupTitleHeight = 35 // divider (15) + header (20)
    const pickupRowHeight = 30
    
    const totalContentHeight = titleAndHeaderHeight 
      + route.stops.length * stopHeight 
      + pickupTitleHeight 
      + (route.pickups?.length || 0) * pickupRowHeight
      
    const pageHeightLimit = 660
    const remainderHeight = totalContentHeight % pageHeightLimit
    let padCount = 0
    if (remainderHeight > 0) {
      padCount = Math.floor((pageHeightLimit - remainderHeight) / pickupRowHeight)
    }
    // Always guarantee at least 4 empty rows for manual entry
    if (padCount < 4) {
      padCount += 4
    }

    // Render empty padding rows under the Special Pickups section
    for (let i = 0; i < padCount; i++) {
      const row = formWs.addRow([
        '↩', // Render the special pickup icon so they match
        '',  // Empty client name
        '', '', '', '', '', '', '', '', '', ''
      ])
      row.height = 30
      row.eachCell({ includeEmpty: true }, c => {
        c.border = borderAll
        c.alignment = { vertical: 'middle' }
      })
    }

    formWs.pageSetup.printArea = `A1:L${formWs.rowCount}`
  }

  // Global font formatting to Arial 13 (maintaining larger headers)
  wb.worksheets.forEach(ws => {
    ws.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        const currentFont = cell.font || {}
        const currentSize = currentFont.size
        cell.font = {
          ...currentFont,
          name: 'Arial',
          size: (!currentSize || currentSize < 13) ? 13 : currentSize,
        }
      })
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `קווים-${date.replace(/\//g, '-')}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
