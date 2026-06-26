import { useEffect, useState } from 'react'
import { fetchProjectContributors } from '../api/adoApi'
import type { Contributor } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import type { AnomalyResult } from '../anomaly/detector'
import type { Developer } from '../types'

interface Props {
  onSelectDeveloper: (dev: Developer) => void
  dateRange:         'today' | 'week' | 'month'
}

interface Row {
  contributor: Contributor
  anomaly:     AnomalyResult
}

export default function TeamView({ onSelectDeveloper, dateRange }: Props) {
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    loadTeam()
  }, [dateRange])

  async function loadTeam() {
    setLoading(true)
    setError(null)

    try {
      const contributors = await fetchProjectContributors(dateRange)
      const built: Row[] = contributors.map(c => ({
        contributor: c,
        anomaly:     detectAnomalies(c, dateRange),
      }))
      built.sort((a, b) => {
        if (a.anomaly.hasAnomaly !== b.anomaly.hasAnomaly) {
          return a.anomaly.hasAnomaly ? -1 : 1
        }
        return b.contributor.commits.length - a.contributor.commits.length
      })
      setRows(built)
    } catch {
      setError('Failed to load team data. Check your ADO connection.')
    } finally {
      setLoading(false)
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
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-[#0078D4] text-white hover:bg-[#0A4C8C] transition-colors
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]"
        >
          Retry
        </button>
      </div>
    )
  }

  const anomalyCount = rows.filter(r => r.anomaly.hasAnomaly).length
  const totalCommits  = rows.reduce((sum, r) => sum + r.contributor.commits.length, 0)

  return (
    <div className="space-y-5">

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Contributors" value={rows.length} />
        <SummaryCard
          label="Anomalies Detected"
          value={anomalyCount}
          tone={anomalyCount > 0 ? 'danger' : 'success'}
        />
        <SummaryCard label="Total Commits" value={totalCommits} />
      </div>

      {/* TEAM TABLE */}
      <div className="bg-white rounded-lg border border-[#E1E1E1] overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-[#605E5C]">
              No contributor activity found for this period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA] border-b border-[#E1E1E1]">
                  <Th align="left"   className="w-[34%]">Developer</Th>
                  <Th align="center">Commits</Th>
                  <Th align="center">PRs</Th>
                  <Th align="center">Work Items</Th>
                  <Th align="center">Effort (hrs)</Th>
                  <Th align="center" className="w-32">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.contributor.key}
                    onClick={() => onSelectDeveloper({
                      id:    row.contributor.key,
                      name:  row.contributor.displayName,
                      email: row.contributor.email,
                    })}
                    className={`border-b border-[#F3F2F1] last:border-b-0 cursor-pointer transition-colors
                      hover:bg-[#EFF6FC]
                      ${row.anomaly.hasAnomaly ? 'bg-[#FDF3F4]' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#0078D4] flex items-center justify-center
                                        text-white text-xs font-semibold shrink-0">
                          {row.contributor.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[#1B1A19] text-sm truncate">
                            {row.contributor.displayName}
                          </p>
                          <p className="text-xs text-[#605E5C] truncate">
                            {row.contributor.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <Td value={row.contributor.commits.length} flagWhenZero />
                    <Td value={row.contributor.prs.length} />
                    <Td value={row.contributor.workItems.length} />
                    <Td value={row.contributor.totalEffortHours.toFixed(1)} flagWhenZero={row.contributor.totalEffortHours === 0} />
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
  const valueColor =
    tone === 'success' ? 'text-[#107C10]' :
    tone === 'danger'  ? 'text-[#D13438]' :
    'text-[#1B1A19]'

  return (
    <div className="bg-white rounded-lg border border-[#E1E1E1] p-4">
      <p className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1.5 tabular-nums ${valueColor}`}>{value}</p>
    </div>
  )
}

function Th({
  children, align = 'left', className = '',
}: { children: React.ReactNode, align?: 'left' | 'center', className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-[#605E5C] uppercase tracking-wide
                     ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      {children}
    </th>
  )
}

function Td({ value, flagWhenZero }: { value: number | string, flagWhenZero?: boolean }) {
  const isZero = flagWhenZero && (value === 0 || value === '0.0')
  return (
    <td className="px-4 py-3 text-center">
      <span className={`text-sm font-semibold tabular-nums ${isZero ? 'text-[#D13438]' : 'text-[#1B1A19]'}`}>
        {value}
      </span>
    </td>
  )
}

function StatusPill({ anomaly }: { anomaly: AnomalyResult }) {
  if (anomaly.hasAnomaly) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        bg-[#FDF3F4] text-[#D13438] border border-[#F3D6D7]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#D13438]" aria-hidden="true" />
        {anomaly.items.length} issue{anomaly.items.length !== 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                      bg-[#EAF7EA] text-[#107C10] border border-[#CDEACD]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#107C10]" aria-hidden="true" />
      Normal
    </span>
  )
}