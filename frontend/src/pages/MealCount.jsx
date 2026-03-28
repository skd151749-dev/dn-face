import { useEffect, useState } from 'react'
import { Loader2, UtensilsCrossed } from 'lucide-react'

import ScanAttendance from './ScanAttendance.jsx'
import { api } from '../utils/api.js'

export default function MealCount() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await api.getMealMonitoring()
        if (alive) setRows(res.rows || [])
      } catch (err) {
        if (alive) setRows([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 8000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="space-y-6">
      <ScanAttendance initialMode="meal" lockMode />

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <UtensilsCrossed size={20} className="text-orange-300" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Meal Status Monitoring</h2>
            <p className="text-slate-400 text-xs">Students marked as Received only after successful attendance check-in.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Name', 'ID', 'Group', 'Check-in', 'Meal Status', 'Meal Time'].map((header) => (
                    <th key={header} className="text-left py-2 px-3 text-xs uppercase tracking-widest text-slate-500 font-mono whitespace-nowrap">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id} className="border-b border-white/5 hover:bg-white/2">
                    <td className="py-2.5 px-3 text-white">{row.name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{row.user_id}</td>
                    <td className="py-2.5 px-3 text-cyan-300 text-xs">{row.group_name || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-green-300">{row.check_in || '-'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        row.meal_status === 'Verified'
                          ? 'bg-green-500/15 text-green-300'
                          : 'bg-white/5 text-slate-300'
                      }`}>
                        {row.meal_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-yellow-300">{row.meal_time || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
