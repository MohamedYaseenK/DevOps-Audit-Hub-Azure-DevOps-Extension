import { useEffect, useMemo, useState } from 'react'
import {
  fetchProjectContributors, calculateRawScore, normaliseScores, getExpectedWorkingHours,
} from '../api/adoApi'
import { exportElementToPdf } from '../utils/pdfExport'
import type { Contributor, PeriodInput } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import type { AnomalyResult } from '../anomaly/detector'
import type { Developer } from '../types'

interface Props {
  onSelectDeveloper: (dev: Developer) => void
  dateRange:         PeriodInput
}

interface Row {
  contributor: Contributor
  anomaly:     AnomalyResult
  score:       number
}

type SortKey = 'name' | 'commits' | 'prs' | 'workItems' | 'effort' | 'score' | 'status'
type SortDir = 'asc' | 'desc'

interface RangeFilter { min: number | null, max: number | null }
const EMPTY_RANGE: RangeFilter = { min: null, max: null }

export default function TeamView({ onSelectDeveloper, dateRange }: Props) {
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [search,       setSearch]       = useState('')
  const [statusFilter,  setStatusFilter] = useState<'all' | 'normal' | 'issues'>('all')
  const [rangeFilters,  setRangeFilters] = useState<Record<'commits' | 'prs' | 'workItems' | 'effort' | 'score', RangeFilter>>({
    commits: EMPTY_RANGE, prs: EMPTY_RANGE, workItems: EMPTY_RANGE, effort: EMPTY_RANGE, score: EMPTY_RANGE,
  })

  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadTeam()
  }, [dateRange])

  async function loadTeam() {
    setLoading(true)
    setError(null)

    try {
      const contributors = await fetchProjectContributors(dateRange)

      // detectAnomalies and getExpectedWorkingHours only accept the
      // original 3 presets — when a custom range is active, fall back
      // to 'month' thresholds rather than touching detector.ts at all.
      const anomalyPeriod = typeof dateRange === 'object' ? 'month' : dateRange
      const anomalies     = contributors.map(c => detectAnomalies(c, anomalyPeriod))
      const expectedHours = getExpectedWorkingHours(anomalyPeriod)

      const rawScores = contributors.map((c, i) =>
        calculateRawScore(c, anomalies[i].items, expectedHours).rawScore
      )
      const normalised = normaliseScores(rawScores)

      const built: Row[] = contributors.map((c, i) => ({
        contributor: c,
        anomaly:     anomalies[i],
        score:       normalised[i],
      }))

      setRows(built)
    } catch {
      setError('Failed to load team data. Check your ADO connection.')
    } finally {
      setLoading(false)
    }
  }

  function updateRange(key: keyof typeof rangeFilters, field: 'min' | 'max', value: string) {
    const num = value === '' ? null : Number(value)
    setRangeFilters(prev => ({ ...prev, [key]: { ...prev[key], [field]: num } }))
  }

  function clearRange(key: keyof typeof rangeFilters) {
    setRangeFilters(prev => ({ ...prev, [key]: EMPTY_RANGE }))
  }

  function inRange(value: number, range: RangeFilter): boolean {
    if (range.min !== null && value < range.min) return false
    if (range.max !== null && value > range.max) return false
    return true
  }

  const filteredSorted = useMemo(() => {
    let result = rows

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(r =>
        r.contributor.displayName.toLowerCase().includes(q) ||
        r.contributor.email.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'all') {
      result = result.filter(r =>
        statusFilter === 'issues' ? r.anomaly.hasAnomaly : !r.anomaly.hasAnomaly
      )
    }

    result = result.filter(r =>
      inRange(r.contributor.commits.length, rangeFilters.commits) &&
      inRange(r.contributor.prs.length, rangeFilters.prs) &&
      inRange(r.contributor.workItems.length, rangeFilters.workItems) &&
      inRange(r.contributor.totalEffortHours, rangeFilters.effort) &&
      inRange(r.score, rangeFilters.score)
    )

    const dir = sortDir === 'asc' ? 1 : -1
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'name':      return a.contributor.displayName.localeCompare(b.contributor.displayName) * dir
        case 'commits':   return (a.contributor.commits.length - b.contributor.commits.length) * dir
        case 'prs':       return (a.contributor.prs.length - b.contributor.prs.length) * dir
        case 'workItems': return (a.contributor.workItems.length - b.contributor.workItems.length) * dir
        case 'effort':    return (a.contributor.totalEffortHours - b.contributor.totalEffortHours) * dir
        case 'score':     return (a.score - b.score) * dir
        case 'status':    return (Number(a.anomaly.hasAnomaly) - Number(b.anomaly.hasAnomaly)) * dir
        default:          return 0
      }
    })

    return result
  }, [rows, search, statusFilter, rangeFilters, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportElementToPdf('team-view-export-root', 'team_audit_report')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-7 h-7 border-[3px] border-[#E1E1E1] border-t-[#0078D4] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#605E5C] text-sm">Loading team data…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-[#E1E1E1] rounded-lg p-8 text-center max-w-md mx-auto">
        <p className="text-[#D13438] font-medium mb-1">Couldn&apos;t load team data</p>
        <p className="text-sm text-[#605E5C] mb-4">{error}</p>
        <button
          onClick={loadTeam}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-[#0078D4] text-white hover:bg-[#0A4C8C] transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  const anomalyCount = rows.filter(r => r.anomaly.hasAnomaly).length
  const totalCommits = rows.reduce((sum, r) => sum + r.contributor.commits.length, 0)
  const hasActiveFilters = !!search || statusFilter !== 'all' ||
    Object.values(rangeFilters).some(r => r.min !== null || r.max !== null)

  return (
    <div id="team-view-export-root" className="space-y-5" onClick={() => setOpenFilter(null)}>

      {/* EXPORT */}
      <div className="flex items-center justify-end">
        <button
          onClick={(e) => { e.stopPropagation(); handleExport() }}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                     border border-[#E1E1E1] text-[#605E5C] hover:bg-[#FAFAFA] transition-colors disabled:opacity-50"
        >
          <span aria-hidden="true">⬇</span> {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Contributors" value={rows.length} />
        <SummaryCard label="Anomalies Detected" value={anomalyCount} tone={anomalyCount > 0 ? 'danger' : 'success'} />
        <SummaryCard label="Total Commits" value={totalCommits} />
      </div>

      {/* SEARCH + STATUS FILTER */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search developer name or email…"
          className="flex-1 min-w-[220px] px-3.5 py-2 rounded-md border border-[#E1E1E1] text-sm
                     placeholder:text-[#A19F9D] focus:outline-none focus:border-[#0078D4] focus:ring-1 focus:ring-[#0078D4]"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'normal' | 'issues')}
          className="px-3 py-2 rounded-md border border-[#E1E1E1] text-sm text-[#1B1A19] bg-white
                     focus:outline-none focus:border-[#0078D4]"
        >
          <option value="all">All statuses</option>
          <option value="normal">Normal only</option>
          <option value="issues">Has issues</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch('')
              setStatusFilter('all')
              setRangeFilters({ commits: EMPTY_RANGE, prs: EMPTY_RANGE, workItems: EMPTY_RANGE, effort: EMPTY_RANGE, score: EMPTY_RANGE })
            }}
            className="text-sm text-[#0078D4] hover:text-[#0A4C8C] font-medium"
          >
            Clear all filters
          </button>
        )}
        <span className="text-xs text-[#605E5C] ml-auto">
          Showing {filteredSorted.length} of {rows.length}
        </span>
      </div>

      {/* TEAM TABLE */}
      <div className="bg-white rounded-lg border border-[#E1E1E1] overflow-hidden">
        {filteredSorted.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-[#605E5C]">No contributors match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E1E1E1]">
                  <SortableTh
                    label="Developer" columnKey="name"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    align="left" className="w-[28%]"
                  />
                  <SortableTh
                    label="Commits" columnKey="commits"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    filter={
                      <RangeFilterPopover
                        id="commits" range={rangeFilters.commits}
                        onChange={(f, v) => updateRange('commits', f, v)}
                        onClear={() => clearRange('commits')}
                        open={openFilter === 'commits'} setOpen={setOpenFilter}
                      />
                    }
                  />
                  <SortableTh
                    label="PRs" columnKey="prs"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    filter={
                      <RangeFilterPopover
                        id="prs" range={rangeFilters.prs}
                        onChange={(f, v) => updateRange('prs', f, v)}
                        onClear={() => clearRange('prs')}
                        open={openFilter === 'prs'} setOpen={setOpenFilter}
                      />
                    }
                  />
                  <SortableTh
                    label="Work Items" columnKey="workItems"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    filter={
                      <RangeFilterPopover
                        id="workItems" range={rangeFilters.workItems}
                        onChange={(f, v) => updateRange('workItems', f, v)}
                        onClear={() => clearRange('workItems')}
                        open={openFilter === 'workItems'} setOpen={setOpenFilter}
                      />
                    }
                  />
                  <SortableTh
                    label="Effort (hrs)" columnKey="effort"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    filter={
                      <RangeFilterPopover
                        id="effort" range={rangeFilters.effort}
                        onChange={(f, v) => updateRange('effort', f, v)}
                        onClear={() => clearRange('effort')}
                        open={openFilter === 'effort'} setOpen={setOpenFilter}
                      />
                    }
                  />
                  <SortableTh
                    label="Score" columnKey="score"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    filter={
                      <RangeFilterPopover
                        id="score" range={rangeFilters.score}
                        onChange={(f, v) => updateRange('score', f, v)}
                        onClear={() => clearRange('score')}
                        open={openFilter === 'score'} setOpen={setOpenFilter}
                      />
                    }
                  />
                  <SortableTh
                    label="Status" columnKey="status"
                    sortKey={sortKey} sortDir={sortDir} toggleSort={toggleSort}
                    align="center" className="w-32"
                  />
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((row) => (
                  <tr
                    key={row.contributor.key}
                    onClick={() => onSelectDeveloper({
                      id:    row.contributor.key,
                      name:  row.contributor.displayName,
                      email: row.contributor.email,
                      score: row.score,
                      scoreBreakdown: calculateRawScore(
                        row.contributor,
                        row.anomaly.items,
                        getExpectedWorkingHours(typeof dateRange === 'object' ? 'month' : dateRange)
                      ),
                    })}
                    className="border-b border-[#F3F2F1] last:border-b-0 cursor-pointer transition-colors hover:bg-[#EFF6FC]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#0078D4] flex items-center justify-center text-white text-xs font-semibold shrink-0">
                          {row.contributor.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[#1B1A19] text-sm truncate">{row.contributor.displayName}</p>
                          <p className="text-xs text-[#605E5C] truncate">{row.contributor.email}</p>
                        </div>
                      </div>
                    </td>
                    <Td value={row.contributor.commits.length} flagWhenZero />
                    <Td value={row.contributor.prs.length} />
                    <Td value={row.contributor.workItems.length} />
                    <Td value={row.contributor.totalEffortHours.toFixed(1)} flagWhenZero={row.contributor.totalEffortHours === 0} />
                    <td className="px-4 py-3 text-center">
                      <ScorePill score={row.score} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusPill anomaly={row.anomaly} />
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

// ─────────────────────────────────────────────
// Presentational sub-components
// ─────────────────────────────────────────────

function SummaryCard({
  label, value, tone = 'default',
}: { label: string, value: number, tone?: 'default' | 'success' | 'danger' }) {
  const valueColor = tone === 'success' ? 'text-[#107C10]' : tone === 'danger' ? 'text-[#D13438]' : 'text-[#1B1A19]'
  return (
    <div className="bg-white rounded-lg border border-[#E1E1E1] p-4">
      <p className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1.5 tabular-nums ${valueColor}`}>{value}</p>
    </div>
  )
}

function SortableTh({
  label, columnKey, sortKey, sortDir, toggleSort, align = 'center', className = '', filter,
}: {
  label: string
  columnKey: SortKey
  sortKey: SortKey
  sortDir: SortDir
  toggleSort: (k: SortKey) => void
  align?: 'left' | 'center'
  className?: string
  filter?: React.ReactNode
}) {
  const isActive = sortKey === columnKey
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-[#605E5C] uppercase tracking-wide select-none
                     ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      <div className={`flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleSort(columnKey) }}
          className="flex items-center gap-1 hover:text-[#1B1A19] transition-colors"
        >
          {label}
          <span className={`text-[10px] ${isActive ? 'text-[#0078D4]' : 'text-[#C8C6C4]'}`}>
            {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
          </span>
        </button>
        {filter}
      </div>
    </th>
  )
}

function RangeFilterPopover({
  id, range, onChange, onClear, open, setOpen,
}: {
  id: string
  range: RangeFilter
  onChange: (field: 'min' | 'max', value: string) => void
  onClear: () => void
  open: boolean
  setOpen: (id: string | null) => void
}) {
  const isActive = range.min !== null || range.max !== null
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen(open ? null : id)}
        aria-label={`Filter ${id}`}
        className={`w-4 h-4 flex items-center justify-center rounded text-[10px] leading-none
          ${isActive ? 'text-[#0078D4]' : 'text-[#C8C6C4] hover:text-[#605E5C]'}`}
      >
        ▽
      </button>
      {open && (
        <div className="absolute z-10 top-full right-0 mt-2 w-44 bg-white border border-[#E1E1E1] rounded-lg shadow-lg p-3">
          <p className="text-[10px] font-semibold text-[#605E5C] uppercase tracking-wide mb-2">Filter range</p>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              placeholder="Min"
              value={range.min ?? ''}
              onChange={e => onChange('min', e.target.value)}
              className="w-full px-2 py-1 text-sm border border-[#E1E1E1] rounded-md focus:outline-none focus:border-[#0078D4]"
            />
            <span className="text-[#A19F9D] text-xs">–</span>
            <input
              type="number"
              placeholder="Max"
              value={range.max ?? ''}
              onChange={e => onChange('max', e.target.value)}
              className="w-full px-2 py-1 text-sm border border-[#E1E1E1] rounded-md focus:outline-none focus:border-[#0078D4]"
            />
          </div>
          <div className="flex items-center justify-between">
            <button onClick={onClear} className="text-xs text-[#605E5C] hover:text-[#D13438]">Clear</button>
            <button onClick={() => setOpen(null)} className="text-xs text-[#0078D4] font-medium">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Td({ value, flagWhenZero }: { value: number | string, flagWhenZero?: boolean }) {
  const isZero = flagWhenZero && (value === 0 || value === '0.0')
  return (
    <td className="px-4 py-3 text-center">
      <span className={`text-sm font-semibold tabular-nums ${isZero ? 'text-[#D13438]' : 'text-[#1B1A19]'}`}>{value}</span>
    </td>
  )
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 75 ? 'bg-[#EAF7EA] text-[#107C10] border-[#CDEACD]' :
    score >= 50 ? 'bg-[#FFF4CE] text-[#8A6D00] border-[#F3E3A3]' :
    'bg-[#FDF3F4] text-[#D13438] border-[#F3D6D7]'
  return (
    <span className={`inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1 rounded-full text-xs font-semibold tabular-nums border ${tone}`}>
      {score}
    </span>
  )
}

function StatusPill({ anomaly }: { anomaly: AnomalyResult }) {
  if (anomaly.hasAnomaly) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#FDF3F4] text-[#D13438] border border-[#F3D6D7]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#D13438]" />
        {anomaly.items.length} issue{anomaly.items.length !== 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#EAF7EA] text-[#107C10] border border-[#CDEACD]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#107C10]" />
      Normal
    </span>
  )
}