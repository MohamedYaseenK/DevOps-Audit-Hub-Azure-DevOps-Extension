import { useEffect, useState } from 'react'
import type { Developer } from '../types'
import { fetchContributorDetail } from '../api/adoApi'
import type { Contributor } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import type { AnomalyResult } from '../anomaly/detector'

interface Props {
  developer: Developer
  dateRange: 'today' | 'week' | 'month'
}

type Tab = 'overview' | 'commits' | 'workitems' | 'prs' | 'effort'

export default function DeveloperView({ developer, dateRange }: Props) {
  const [contributor, setContributor] = useState<Contributor | null>(null)
  const [anomaly,      setAnomaly]     = useState<AnomalyResult | null>(null)
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState<string | null>(null)
  const [tab,          setTab]         = useState<Tab>('overview')

  useEffect(() => {
    loadData()
    setTab('overview')
  }, [developer.id, dateRange])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const detail = await fetchContributorDetail(developer.id, dateRange)
      if (!detail) {
        setError('No data found for this contributor in the selected period.')
        return
      }
      setContributor(detail)
      setAnomaly(detectAnomalies(detail, dateRange))
    } catch {
      setError('Failed to load developer data.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-7 h-7 border-[3px] border-[#E1E1E1] border-t-[#0078D4] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[#605E5C] text-sm">Loading {developer.name}&apos;s activity…</p>
        </div>
      </div>
    )
  }

  if (error || !contributor) {
    return (
      <div className="bg-white border border-[#E1E1E1] rounded-lg p-8 text-center max-w-md mx-auto">
        <p className="text-[#D13438] font-medium mb-1">Couldn&apos;t load this developer&apos;s data</p>
        <p className="text-sm text-[#605E5C] mb-4">{error}</p>
        <button
          onClick={loadData}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-[#0078D4] text-white hover:bg-[#0A4C8C] transition-colors
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]"
        >
          Retry
        </button>
      </div>
    )
  }

  const tabs: { key: Tab, label: string, count?: number }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'commits',   label: 'Commits',        count: contributor.commits.length },
    { key: 'workitems', label: 'Work Items',      count: contributor.workItems.length },
    { key: 'prs',       label: 'Pull Requests',   count: contributor.prs.length },
    { key: 'effort',    label: 'Effort by Day' },
  ]

  return (
    <div className="space-y-5">

      {/* HEADER */}
      <div className="bg-white rounded-lg border border-[#E1E1E1] p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#0078D4] flex items-center justify-center
                            text-white text-base font-semibold shrink-0">
              {contributor.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1B1A19] truncate">{contributor.displayName}</h2>
              <p className="text-sm text-[#605E5C] truncate">{contributor.email}</p>
            </div>
          </div>
          {anomaly && <StatusBadge anomaly={anomaly} />}
        </div>
      </div>

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="Commits"       value={contributor.commits.length}    flagBad={contributor.commits.length === 0} />
        <Metric label="Pull Requests" value={contributor.prs.length} />
        <Metric label="Work Items"    value={contributor.workItems.length} />
        <Metric label="Effort (hrs)"  value={contributor.totalEffortHours.toFixed(1)} flagBad={contributor.totalEffortHours === 0} />
      </div>

      {/* TABS */}
      <div className="bg-white rounded-lg border border-[#E1E1E1]">
        <div
          role="tablist"
          aria-label="Developer detail sections"
          className="flex items-center gap-1 px-3 pt-3 border-b border-[#E1E1E1] overflow-x-auto"
        >
          {tabs.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-t-md text-sm font-medium whitespace-nowrap transition-colors -mb-px border-b-2
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]
                ${tab === t.key
                  ? 'border-[#0078D4] text-[#0078D4] bg-[#EFF6FC]'
                  : 'border-transparent text-[#605E5C] hover:text-[#1B1A19] hover:bg-[#FAFAFA]'}`}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'overview'  && <OverviewTab anomaly={anomaly} />}
          {tab === 'commits'   && <CommitsTab commits={contributor.commits} />}
          {tab === 'workitems' && <WorkItemsTab workItems={contributor.workItems} />}
          {tab === 'prs'       && <PrsTab prs={contributor.prs} />}
          {tab === 'effort'    && <EffortByDayTab workItems={contributor.workItems} />}
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// Shared presentational pieces
// ─────────────────────────────────────────────

function Metric({ label, value, flagBad }: { label: string, value: number | string, flagBad?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-[#E1E1E1] p-4 text-center">
      <p className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-semibold mt-1.5 tabular-nums ${flagBad ? 'text-[#D13438]' : 'text-[#1B1A19]'}`}>
        {value}
      </p>
    </div>
  )
}

function StatusBadge({ anomaly }: { anomaly: AnomalyResult }) {
  if (anomaly.hasAnomaly) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                        bg-[#FDF3F4] text-[#D13438] border border-[#F3D6D7] shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#D13438]" aria-hidden="true" />
        {anomaly.items.length} issue{anomaly.items.length !== 1 ? 's' : ''} detected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                      bg-[#EAF7EA] text-[#107C10] border border-[#CDEACD] shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-[#107C10]" aria-hidden="true" />
      Normal
    </span>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-[#605E5C] text-center py-10">{message}</p>
  )
}

// ─────────────────────────────────────────────
// Tab content
// ─────────────────────────────────────────────

function OverviewTab({ anomaly }: { anomaly: AnomalyResult | null }) {
  if (!anomaly || anomaly.items.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[#107C10] font-medium text-sm">No anomalies detected for this period.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold text-[#1B1A19] mb-1">Detected Issues</h3>
      {anomaly.items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 bg-[#FDF3F4] border border-[#F3D6D7] rounded-lg"
        >
          <span className="text-[#D13438] mt-0.5 text-sm shrink-0" aria-hidden="true">●</span>
          <div className="min-w-0">
            <p className="text-sm text-[#1B1A19]">{item.message}</p>
            <p className="text-xs text-[#605E5C] mt-0.5 capitalize">{item.type.replace('_', ' ')}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function CommitsTab({ commits }: { commits: { commitId: string, comment: string, date: string }[] }) {
  if (commits.length === 0) {
    return <EmptyState message="No commits in this period." />
  }
  return (
    <div className="divide-y divide-[#F3F2F1] -mx-5 -my-5">
      {commits.map(c => (
        <div key={c.commitId} className="px-5 py-3">
          <p className="text-sm text-[#1B1A19] font-medium leading-snug">{c.comment}</p>
          <p className="text-xs text-[#605E5C] mt-1">{new Date(c.date).toLocaleString()}</p>
        </div>
      ))}
    </div>
  )
}

function WorkItemsTab({ workItems }: { workItems: { id: number, title: string, state: string, effort: number }[] }) {
  if (workItems.length === 0) {
    return <EmptyState message="No work items in this period." />
  }
  return (
    <div className="overflow-x-auto -mx-5 -my-5">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFAFA]">
            <th className="text-left   px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-20">ID</th>
            <th className="text-left   px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide">Title</th>
            <th className="text-center px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-32">State</th>
            <th className="text-center px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-24">Effort</th>
          </tr>
        </thead>
        <tbody>
          {workItems.map(wi => (
            <tr key={wi.id} className="border-t border-[#F3F2F1]">
              <td className="px-5 py-2.5 text-sm text-[#605E5C] tabular-nums">#{wi.id}</td>
              <td className="px-5 py-2.5 text-sm text-[#1B1A19]">{wi.title}</td>
              <td className="px-5 py-2.5 text-center">
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-[#F3F2F1] text-[#605E5C] whitespace-nowrap">
                  {wi.state}
                </span>
              </td>
              <td className={`px-5 py-2.5 text-center text-sm tabular-nums
                ${wi.effort > 0 && (wi.effort < 1 || wi.effort > 3) ? 'text-[#D13438] font-semibold' : 'text-[#605E5C]'}`}>
                {wi.effort ? `${wi.effort}h` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PrsTab({ prs }: { prs: { pullRequestId: number, title: string, status: string }[] }) {
  if (prs.length === 0) {
    return <EmptyState message="No pull requests in this period." />
  }
  return (
    <div className="divide-y divide-[#F3F2F1] -mx-5 -my-5">
      {prs.map(pr => (
        <div key={pr.pullRequestId} className="px-5 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-[#1B1A19] min-w-0 truncate">{pr.title}</p>
          <span className="text-xs px-2 py-1 rounded-full font-medium bg-[#F3F2F1] text-[#605E5C] shrink-0 whitespace-nowrap">
            {pr.status}
          </span>
        </div>
      ))}
    </div>
  )
}

function EffortByDayTab({ workItems }: { workItems: { changedDate: string, effort: number }[] }) {
  const grouped = new Map<string, number>()

  for (const wi of workItems) {
    if (!wi.changedDate) continue
    const dateKey = new Date(wi.changedDate).toISOString().split('T')[0]
    grouped.set(dateKey, (grouped.get(dateKey) || 0) + wi.effort)
  }

  const rows = Array.from(grouped.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, hours]) => ({
      date,
      day: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
      hours,
    }))

  if (rows.length === 0) {
    return <EmptyState message="No effort data available for this period." />
  }

  return (
    <div className="overflow-x-auto -mx-5 -my-5">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-[#FAFAFA]">
            <th className="text-left   px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-36">Date</th>
            <th className="text-left   px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide">Day</th>
            <th className="text-center px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-32">Hours Worked</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.date} className="border-t border-[#F3F2F1]">
              <td className="px-5 py-2.5 text-sm text-[#1B1A19] tabular-nums">{r.date}</td>
              <td className="px-5 py-2.5 text-sm text-[#605E5C]">{r.day}</td>
              <td className={`px-5 py-2.5 text-center text-sm tabular-nums font-medium
                ${r.hours === 0 ? 'text-[#D13438]' : 'text-[#1B1A19]'}`}>
                {r.hours.toFixed(1)}h
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}