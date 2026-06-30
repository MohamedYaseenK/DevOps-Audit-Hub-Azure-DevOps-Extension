import { useEffect, useRef, useState } from 'react'
import type { Developer } from '../types'
import { fetchContributorDetail } from '../api/adoApi'
import type { Contributor, PeriodInput } from '../api/adoApi'
import { exportElementToPdf } from '../utils/pdfExport'
import { detectAnomalies } from '../anomaly/detector'
import type { AnomalyResult } from '../anomaly/detector'

interface Props {
  developer: Developer
  dateRange: PeriodInput
}

type Tab = 'overview' | 'commits' | 'workitems' | 'prs' | 'effort'

export default function DeveloperView({ developer, dateRange }: Props) {
  const [contributor, setContributor] = useState<Contributor | null>(null)
  const [anomaly,      setAnomaly]     = useState<AnomalyResult | null>(null)
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState<string | null>(null)
  const [tab,          setTab]         = useState<Tab>('overview')
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false)
  const [exporting,    setExporting]   = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const pageRef  = useRef<HTMLDivElement>(null)

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

      const anomalyPeriod = typeof dateRange === 'object' ? 'month' : dateRange
      setAnomaly(detectAnomalies(detail, anomalyPeriod))
    } catch {
      setError('Failed to load developer data.')
    } finally {
      setLoading(false)
    }
  }

  function jumpToTab(target: Tab) {
    setTab(target)
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function handleExport() {
    if (!pageRef.current) return
    setExporting(true)
    try {
      await exportElementToPdf(pageRef.current.id, `${developer.name.replace(/\s+/g, '_')}_audit_report`)
    } finally {
      setExporting(false)
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
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-[#0078D4] text-white hover:bg-[#0A4C8C] transition-colors"
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
    <div id="developer-view-export-root" ref={pageRef} className="space-y-5" onClick={() => setScoreInfoOpen(false)}>

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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                         border border-[#E1E1E1] text-[#605E5C] hover:bg-[#FAFAFA] transition-colors disabled:opacity-50"
            >
              <span aria-hidden="true">⬇</span> {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            {anomaly && (
              anomaly.hasAnomaly ? (
                <button
                  onClick={() => jumpToTab('overview')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                             bg-[#FDF3F4] text-[#D13438] border border-[#F3D6D7] hover:bg-[#FBE4E6] transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D13438]" />
                  {anomaly.items.length} issue{anomaly.items.length !== 1 ? 's' : ''} detected
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                  bg-[#EAF7EA] text-[#107C10] border border-[#CDEACD]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#107C10]" />
                  Normal
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Metric icon="🔀" label="Commits"       value={contributor.commits.length}    flagBad={contributor.commits.length === 0} />
        <Metric icon="🔁" label="Pull Requests" value={contributor.prs.length} />
        <Metric icon="📋" label="Work Items"    value={contributor.workItems.length} />
        <Metric icon="⏱️" label="Effort (hrs)"  value={contributor.totalEffortHours.toFixed(1)} flagBad={contributor.totalEffortHours === 0} />
        {developer.score !== undefined && (
          <Metric
            icon="🏆" label="Score" value={developer.score} scoreTone
            infoSlot={
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setScoreInfoOpen(o => !o)}
                  aria-label="How is the score calculated?"
                  className="w-4 h-4 flex items-center justify-center rounded-full bg-[#F3F2F1] text-[#605E5C]
                             text-[10px] font-semibold hover:bg-[#E1E1E1] transition-colors"
                >
                  ?
                </button>
                {scoreInfoOpen && (
                  <div className="absolute z-20 top-full right-0 mt-2 w-60 bg-white border border-[#E1E1E1]
                                  rounded-lg shadow-lg p-3 text-left">
                    <p className="text-[11px] font-semibold text-[#1B1A19] mb-1.5">How this score works</p>
                    <p className="text-[11px] text-[#605E5C] leading-relaxed">
                      Points come from commits, pull requests, work items, and logged effort —
                      with effort capped at 150% of expected hours so over-logging can&apos;t
                      inflate the score. Anomalies reduce points, with working-hours
                      violations penalised in proportion to how extreme they are. The
                      final score is scaled 0–100 relative to the top performer in the
                      current view.
                    </p>
                  </div>
                )}
              </div>
            }
          />
        )}
      </div>

      {/* SCORE BREAKDOWN */}
      {developer.scoreBreakdown && (
        <div className="bg-white rounded-lg border border-[#E1E1E1] p-5">
          <h3 className="text-sm font-semibold text-[#1B1A19] mb-3">Score Breakdown</h3>
          <div className="space-y-2">
            <BreakdownRow label="Commits"        points={developer.scoreBreakdown.commitsPoints}   onClick={() => jumpToTab('commits')} />
            <BreakdownRow label="Pull Requests"  points={developer.scoreBreakdown.prsPoints}        onClick={() => jumpToTab('prs')} />
            <BreakdownRow label="Work Items"     points={developer.scoreBreakdown.workItemsPoints}  onClick={() => jumpToTab('workitems')} />
            <BreakdownRow label="Logged Effort"  points={developer.scoreBreakdown.effortPoints}     onClick={() => jumpToTab('effort')} />
            <BreakdownRow label="Anomaly Penalty" points={developer.scoreBreakdown.anomalyPoints}   onClick={() => jumpToTab('overview')} />
            <div className="flex items-center justify-between pt-2 border-t border-[#F3F2F1]">
              <span className="text-sm font-semibold text-[#1B1A19]">Raw Total</span>
              <span className="text-sm font-semibold text-[#1B1A19] tabular-nums">
                {developer.scoreBreakdown.rawScore.toFixed(1)} pts
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TABS */}
      <div ref={panelRef} className="bg-white rounded-lg border border-[#E1E1E1] scroll-mt-4">
        <div className="flex items-center gap-1 px-3 pt-3 border-b border-[#E1E1E1] overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-t-md text-sm font-medium whitespace-nowrap transition-colors -mb-px border-b-2
                ${tab === t.key
                  ? 'border-[#0078D4] text-[#0078D4] bg-[#EFF6FC]'
                  : 'border-transparent text-[#605E5C] hover:text-[#1B1A19] hover:bg-[#FAFAFA]'}`}
            >
              {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[480px] overflow-y-auto">
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

function Metric({
  icon, label, value, flagBad, scoreTone, infoSlot,
}: { icon: string, label: string, value: number | string, flagBad?: boolean, scoreTone?: boolean, infoSlot?: React.ReactNode }) {
  const color = scoreTone
    ? (Number(value) >= 75 ? 'text-[#107C10]' : Number(value) >= 50 ? 'text-[#8A6D00]' : 'text-[#D13438]')
    : flagBad ? 'text-[#D13438]' : 'text-[#1B1A19]'

  return (
    <div className="bg-white rounded-lg border border-[#E1E1E1] p-4 text-center relative">
      <div className="flex items-center justify-center gap-1.5">
        <span className="text-sm" aria-hidden="true">{icon}</span>
        <p className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">{label}</p>
        {infoSlot}
      </div>
      <p className={`text-2xl font-semibold mt-1.5 tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function BreakdownRow({ label, points, onClick }: { label: string, points: number, onClick: () => void }) {
  const isNegative = points < 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-[#FAFAFA] transition-colors text-left"
    >
      <span className="text-sm text-[#605E5C]">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${isNegative ? 'text-[#D13438]' : 'text-[#1B1A19]'}`}>
        {isNegative ? '' : '+'}{points.toFixed(1)} pts
      </span>
    </button>
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
          className="flex items-start gap-3 p-3 bg-white border border-[#E1E1E1] border-l-[3px] border-l-[#D13438] rounded-lg"
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
    <div className="overflow-x-auto -mx-5 -my-5">
      <table className="w-full border-collapse">
        <thead className="sticky top-0">
          <tr className="bg-[#FAFAFA]">
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide">Message</th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-44">Date</th>
          </tr>
        </thead>
        <tbody>
          {commits.map(c => (
            <tr key={c.commitId} className="border-t border-[#F3F2F1]">
              <td className="px-5 py-2.5 text-sm text-[#1B1A19]">{c.comment}</td>
              <td className="px-5 py-2.5 text-sm text-[#605E5C] whitespace-nowrap">
                {new Date(c.date).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <thead className="sticky top-0">
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
    <div className="overflow-x-auto -mx-5 -my-5">
      <table className="w-full border-collapse">
        <thead className="sticky top-0">
          <tr className="bg-[#FAFAFA]">
            <th className="text-left   px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide">Title</th>
            <th className="text-center px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-32">Status</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr key={pr.pullRequestId} className="border-t border-[#F3F2F1]">
              <td className="px-5 py-2.5 text-sm text-[#1B1A19]">{pr.title}</td>
              <td className="px-5 py-2.5 text-center">
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-[#F3F2F1] text-[#605E5C] whitespace-nowrap">
                  {pr.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EffortByDayTab({ workItems }: { workItems: { changedDate: string, effort: number }[] }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const grouped = new Map<string, number>()
  for (const wi of workItems) {
    if (!wi.changedDate) continue
    const dateKey = new Date(wi.changedDate).toISOString().split('T')[0]
    grouped.set(dateKey, (grouped.get(dateKey) || 0) + wi.effort)
  }

  const dir = sortDir === 'asc' ? 1 : -1
  const rows = Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]) * dir)
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
        <thead className="sticky top-0">
          <tr className="bg-[#FAFAFA]">
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide w-36">
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1 hover:text-[#1B1A19] transition-colors"
              >
                Date
                <span className="text-[10px] text-[#0078D4]">{sortDir === 'asc' ? '▲' : '▼'}</span>
              </button>
            </th>
            <th className="text-left px-5 py-2.5 text-xs font-semibold text-[#605E5C] uppercase tracking-wide">Day</th>
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