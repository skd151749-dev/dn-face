import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
} from 'lucide-react'

import BrandLogo from '../components/BrandLogo.jsx'
import { useBranding } from '../App.jsx'
import { api } from '../utils/api.js'

const STATUS_STYLES = {
  'On Time': 'border border-green-500/20 bg-green-500/12 text-green-200',
  Present: 'border border-green-500/20 bg-green-500/12 text-green-200',
  Late: 'border border-yellow-500/20 bg-yellow-500/12 text-yellow-200',
  Absent: 'border border-red-500/20 bg-red-500/12 text-red-200',
  'Leave Early': 'border border-violet-500/20 bg-violet-500/12 text-violet-200',
}

const PERIOD_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

export default function Reports() {
  const { branding } = useBranding()
  const [period, setPeriod] = useState('daily')
  const [reportDate, setReportDate] = useState('')
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(() => localStorage.getItem('group') || '')
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.getGroups()
      .then((res) => {
        const items = res.groups || []
        setGroups(items)
        if (!selectedGroup && items[0]?.name) {
          setSelectedGroup(items[0].name)
          localStorage.setItem('group', items[0].name)
        }
      })
      .catch(() => {})
  }, [selectedGroup])

  const buildParams = useCallback((targetPeriod = period, targetDate = reportDate, targetGroup = selectedGroup) => {
    const params = {}
    if (targetDate) {
      params.period = 'custom'
      params.start_date = targetDate
      params.end_date = targetDate
    } else {
      params.period = targetPeriod
    }
    if (targetGroup) {
      localStorage.setItem('group', targetGroup)
    }
    return params
  }, [period, reportDate, selectedGroup])

  const fetchReport = useCallback(async (targetPeriod = period, targetDate = reportDate, targetGroup = selectedGroup) => {
    setLoading(true)
    setError('')
    try {
      const params = buildParams(targetPeriod, targetDate, targetGroup)
      const res = await api.attendanceReport(params)
      setRecords(res.records || [])
      setSummary(res.summary || null)
    } catch (err) {
      setError(err.message || 'Unable to load reports right now.')
    } finally {
      setLoading(false)
    }
  }, [buildParams, period, reportDate, selectedGroup])

  useEffect(() => {
    if (!selectedGroup) return
    fetchReport(period, reportDate, selectedGroup)
  }, [fetchReport, period, reportDate, selectedGroup])

  async function handleExport(format) {
    setExporting(format)
    try {
      await api.exportReport(format, buildParams())
    } catch (err) {
      alert(err.message || 'Export failed. Please try again.')
    } finally {
      setExporting('')
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return records
    return records.filter((row) => (
      row.name?.toLowerCase().includes(query)
      || row.user_id?.toLowerCase().includes(query)
      || row.class_dept?.toLowerCase().includes(query)
      || row.group_name?.toLowerCase().includes(query)
      || row.sex?.toLowerCase().includes(query)
    ))
  }, [records, search])

  const effectiveSummary = useMemo(() => {
    if (summary) return summary
    const statusForRow = (row) => row.morning_status === 'Late'
      || row.afternoon_status === 'Late'
      || (row.late_status || row.status) === 'Late'
      ? 'Late'
      : (row.late_status || row.status)
    return {
      total_users: records.length,
      present: records.filter((row) => statusForRow(row) !== 'Absent').length,
      late: records.filter((row) => statusForRow(row) === 'Late').length,
      absent: records.filter((row) => statusForRow(row) === 'Absent').length,
      range: null,
    }
  }, [records, summary])

  const currentRangeLabel = useMemo(() => {
    if (reportDate) return reportDate
    if (effectiveSummary.range?.start && effectiveSummary.range?.end) {
      return `${effectiveSummary.range.start} to ${effectiveSummary.range.end}`
    }
    return PERIOD_LABELS[period]
  }, [effectiveSummary.range, period, reportDate])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card overflow-hidden">
        <div className="relative p-6 md:p-7">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-cyan-400/10 via-violet-400/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo logoUrl={branding.logo_url} showText compact />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">DN FACE Reports</p>
                <h1 className="mt-1 font-display text-2xl text-white">Attendance Reporting</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Clean summaries, clear tables, and export-ready reports for your selected group.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ExportButton label="Excel" icon={<FileSpreadsheet size={14} />} active={exporting === 'excel'} onClick={() => handleExport('excel')} />
              <ExportButton label="CSV" icon={<Download size={14} />} active={exporting === 'csv'} onClick={() => handleExport('csv')} />
              <ExportButton label="PDF" icon={<FileText size={14} />} active={exporting === 'pdf'} onClick={() => handleExport('pdf')} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 md:p-6">
        <div className="mb-5 flex items-start gap-3 text-slate-300">
          <Filter size={16} className="text-cyan-200" />
          <div>
            <h2 className="font-display text-lg text-white">Filters</h2>
            <p className="mt-1 text-sm text-slate-400">Choose a group, date, or period to keep the report view clean and focused.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FilterBlock label="Group">
            <div className="rounded-3xl border border-white/8 bg-slate-950/35 p-4">
              <select
                className="input-field report-field"
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value)
                  localStorage.setItem('group', e.target.value)
                }}
              >
                <option value="">Select group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.name}>{group.name}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">Show records only for the selected class or department.</p>
            </div>
          </FilterBlock>

          <FilterBlock label="Date">
            <div className="rounded-3xl border border-white/8 bg-slate-950/35 p-4">
              <input
                type="date"
                className="input-field report-field"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">Pick one exact day, or leave this empty to use the period buttons.</p>
            </div>
          </FilterBlock>

          <FilterBlock label="Period">
            <div className="rounded-3xl border border-white/8 bg-slate-950/35 p-4">
              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-white/5 bg-slate-950/40 p-1 sm:grid-cols-3">
                {['daily', 'weekly', 'monthly'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setPeriod(item)
                      if (reportDate) setReportDate('')
                    }}
                    className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                      period === item && !reportDate
                        ? 'bg-cyan-300/15 text-cyan-100 shadow-lg shadow-cyan-500/10'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {PERIOD_LABELS[item]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Quickly switch between daily, weekly, and monthly summaries.</p>
            </div>
          </FilterBlock>

          <FilterBlock label="Search">
            <div className="rounded-3xl border border-white/8 bg-slate-950/35 p-4">
              <input
                type="text"
                className="input-field report-field"
                placeholder="Search name or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">Instantly narrow the table without changing the main filters.</p>
            </div>
          </FilterBlock>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-white/8 bg-slate-950/25 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            <ActiveChip label="Group" value={selectedGroup || 'None'} />
            <ActiveChip label="Date" value={reportDate || 'Period mode'} />
            <ActiveChip label="Period" value={reportDate ? 'Custom day' : PERIOD_LABELS[period]} />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fetchReport()}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Reload Report
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReportDate('')
                setSearch('')
              }}
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05]"
            >
              Reset Search
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Selected Group" value={selectedGroup || 'None'} tone="text-cyan-100" />
        <SummaryCard label="Range" value={currentRangeLabel} tone="text-white" />
        <SummaryCard label="Present" value={effectiveSummary.present ?? 0} tone="text-green-300" />
        <SummaryCard label="Absent" value={effectiveSummary.absent ?? 0} tone="text-red-300" />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-white/5 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Report Table</p>
            <p className="mt-1 text-sm text-slate-300">
              {filtered.length} row{filtered.length === 1 ? '' : 's'} loaded. Clean, readable attendance data with group and date context.
            </p>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-cyan-200" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-20 text-center text-slate-500">
            <FileBarChart2 size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No report rows found for the selected filters.</p>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b border-white/5 bg-slate-950/95 backdrop-blur">
                  {['#', 'Name', 'ID', 'Group', 'Date', 'AM In', 'AM Status', 'AM Out', 'PM In', 'PM Status', 'PM Out', 'Overall', 'Early Leave'].map((header) => (
                    <th key={header} className="whitespace-nowrap px-4 py-3 text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr
                    key={`${row.user_id}-${row.date}-${index}`}
                    className={`border-b border-white/5 hover:bg-white/[0.03] ${index % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{index + 1}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{row.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{row.user_id}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-cyan-200">{row.group_name || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{row.date}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-green-300">{row.morning_check_in || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.morning_status || 'Absent'] || 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>
                        {row.morning_status || 'Absent'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-yellow-300">{row.morning_check_out || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-green-300">{row.afternoon_check_in || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.afternoon_status || (row.status === 'Absent' ? 'Absent' : 'On Time')] || 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>
                        {row.afternoon_status || (row.status === 'Absent' ? 'Absent' : 'On Time')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-yellow-300">{row.afternoon_check_out || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.late_status || row.status] || 'border border-white/10 bg-white/[0.04] text-slate-300'}`}>
                        {row.late_status || row.status || '-'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        row.early_leave === 'Yes'
                          ? STATUS_STYLES['Leave Early']
                          : 'border border-white/10 bg-white/[0.04] text-slate-300'
                      }`}>
                        {row.early_leave || 'No'}
                      </span>
                    </td>
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

function FilterBlock({ label, children }) {
  return (
    <div>
      <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-slate-300">{label}</label>
      {children}
    </div>
  )
}

function ActiveChip({ label, value }) {
  return (
    <div className="rounded-full border border-cyan-300/15 bg-cyan-300/8 px-3 py-1.5 text-xs text-cyan-100">
      <span className="mr-2 uppercase tracking-[0.22em] text-cyan-300/80">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className={`mt-3 font-display text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function ExportButton({ label, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {active ? <Loader2 size={14} className="animate-spin" /> : icon}
      {active ? 'Exporting...' : label}
    </button>
  )
}
