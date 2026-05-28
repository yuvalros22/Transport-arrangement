import { NextRequest, NextResponse } from 'next/server'
import { parseAddressUpdateExcel } from '@/lib/excel'

export async function POST(req: NextRequest) {
    try {
        const form = await req.formData()
        const file = form.get('file') as File | null
        if (!file) return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })

        let rows
        try {
            rows = parseAddressUpdateExcel(await file.arrayBuffer())
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 400 })
        }

        if (!rows.length) {
            return NextResponse.json({ error: 'הקובץ ריק — לא נמצאו נתונים לעדכון' }, { status: 400 })
        }

        return NextResponse.json({ rows })
    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ error: e.message || 'שגיאת שרת' }, { status: 500 })
    }
}
