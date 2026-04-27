'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Driver } from '@/types'
import { getAllDrivers, upsertDriver, deleteDriver, newDriverId } from '@/lib/driverDb'

export function DriversManager({ onClose }: { onClose: () => void }) {
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [editing, setEditing] = useState<Driver | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const reload = useCallback(async () => {
        setLoading(true)
        try {
            const data = await getAllDrivers()
            setDrivers(data)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { reload() }, [reload])

    const handleSave = async (d: Driver) => {
        if (!d.name.trim() || !d.truck_number.trim()) {
            setError('חובה למלא שם נהג ומספר משאית')
            return
        }
        setError('')
        try {
            await upsertDriver(d)
            await reload()
            setEditing(null)
        } catch (e: any) {
            setError(e.message)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('למחוק נהג זה?')) return
        try {
            await deleteDriver(id)
            await reload()
        } catch (e: any) {
            setError(e.message)
        }
    }

    return (
        <div className="fixed inset-0 z-[8500] flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(4px)' }}>
            <div className="flex flex-col rounded-2xl shadow-2xl overflow-hidden bg-[#0a1525] border border-[#1e2d45] w-full max-w-md h-[80vh] flex flex-col">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0 bg-blue-500/20 text-blue-400">
                        👨‍✈️
                    </div>
                    <div className="flex-1">
                        <div className="font-black text-sm text-slate-200">מאגר נהגים</div>
                        <div className="text-[11px] text-slate-500">{drivers.length} נהגים משויכים</div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3" dir="rtl">
                    {error && <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 p-2 rounded-lg">{error}</div>}
                    
                    {loading ? (
                        <div className="text-center text-slate-500 py-10 text-sm">טוען נהגים...</div>
                    ) : drivers.length === 0 ? (
                        <div className="text-center text-slate-500 py-10 text-sm flex flex-col gap-2">
                            <span className="text-4xl">👨‍✈️</span>
                            <span>אין נהגים במערכת</span>
                        </div>
                    ) : (
                        drivers.map(drv => (
                            <div key={drv.id} className="flex items-center justify-between p-3 rounded-xl border border-[#1e2d45] bg-[#0f1d30]">
                                <div>
                                    <div className="font-bold text-sm text-slate-200">{drv.name}</div>
                                    <div className="text-xs text-slate-500">מספר משאית: <span className="font-mono text-slate-400">{drv.truck_number}</span></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setEditing(drv)} className="text-slate-500 hover:text-blue-400 px-2">✏️</button>
                                    <button onClick={() => handleDelete(drv.id)} className="text-slate-500 hover:text-red-400 px-2">✕</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-3 border-t border-border shrink-0 bg-[#0f1d30]">
                    <button
                        className="w-full py-2 rounded-xl border-2 transition-all text-sm font-bold bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20"
                        onClick={() => { setError(''); setEditing({ id: newDriverId(), name: '', truck_number: '' }) }}
                    >
                        + הוסף נהג חדש
                    </button>
                </div>
            </div>

            {editing && (
                <div className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
                     style={{ background: 'rgba(0,0,0,.7)' }}>
                    <div className="bg-[#0f1d30] border border-[#1e2d45] rounded-2xl w-full max-w-sm overflow-hidden flex flex-col shadow-2xl" dir="rtl">
                        <div className="px-5 py-4 border-b border-[#1e2d45] flex items-center justify-between bg-[#0a1525]">
                            <span className="font-bold text-slate-200">{editing.name ? 'עריכת נהג' : 'נהג חדש'}</span>
                            <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-300">✕</button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">שם נהג</label>
                                <input className="input w-full" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">מספר רכב / משאית</label>
                                <input className="input w-full" value={editing.truck_number} onChange={e => setEditing({ ...editing, truck_number: e.target.value })} dir="ltr" inputMode="numeric" />
                            </div>
                        </div>
                        <div className="p-4 border-t border-[#1e2d45] flex gap-3">
                            <button className="flex-1 btn-primary py-2 text-sm" onClick={() => handleSave(editing)}>שמור</button>
                            <button className="flex-1 btn-ghost py-2 text-sm" onClick={() => setEditing(null)}>ביטול</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
