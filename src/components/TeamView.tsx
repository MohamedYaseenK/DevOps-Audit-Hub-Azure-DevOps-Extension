import { useEffect, useState } from 'react'
import type { Developer, AnomalyResult } from '../types'
import { fetchTeamMembers, fetchCommits, fetchPullRequests, fetchWorkItems } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import AnomalyBadge from './AnomalyBadge'

interface Props {
  onSelectDeveloper: (dev: Developer) => void
  dateRange:         'today' | 'week' | 'month'
}

interface DeveloperRow {
  developer: Developer
  commits:   number
  prs:       number
  workItems: number
  effort:    number
  anomaly:   AnomalyResult
  loading:   boolean
}

export default function TeamView({ onSelectDeveloper, dateRange }: Props) {
  const [rows,  setRows]  = useState<DeveloperRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    loadTeam()
  }, [dateRange])

  async function loadTeam() {
    setLoading(true)
    setError(null)

    try {
      const members = await fetchTeamMembers()

      // Initialise rows with loading state
      const initialRows: DeveloperRow[] = members.map((m: any) => ({
        developer: {
          id:       m.identity.id,
          name:     m.identity.displayName,
          email:    m.identity.uniqueName,
          imageUrl: m.identity.imageUrl,
        },
        commits:   0,
        prs:       0,
        workItems: 0,
        effort:    0,
        anomaly:   detectAnomalies(0, 0, 0, 0, dateRange),
        loading:   true,
      }))

      setRows(initialRows)
      setLoading(false)

      // Load each developer's data in parallel
      await Promise.all(
        initialRows.map(async (row, index) => {
          try {
            const [commits, prs, workItems] = await Promise.all([
              fetchCommits(row.developer.email, dateRange),
              fetchPullRequests(row.developer.email, dateRange),
              fetchWorkItems(row.developer.email, dateRange),
            ])

            const effort    = workItems.reduce((sum, wi) => sum + (wi.effort || 0), 0)
            const anomaly   = detectAnomalies(effort, commits.length, prs.length, workItems.length, dateRange)

            setRows(prev => prev.map((r, i) =>
              i === index
                ? { ...r, commits: commits.length, prs: prs.length, workItems: workItems.length, effort, anomaly, loading: false }
                : r
            ))
          } catch {
            setRows(prev => prev.map((r, i) =>
              i === index ? { ...r, loading: false } : r
            ))
          }
        })
      )
    } catch (err) {
      setError('Failed to load team data. Check your ADO connection.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-gray-500 text-sm">Loading team data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={loadTeam} className="mt-3 text-sm text-red-500 underline">
          Retry
        </button>
      </div>
    )
  }

  const anomalyCount = rows.filter(r => r.anomaly.hasAnomaly).length

  return (
    <div>
      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Team Members</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{rows.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Anomalies Detected</p>
          <p className={`text-2xl font-bold mt-1 ${anomalyCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {anomalyCount}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Commits</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {rows.reduce((sum, r) => sum + r.commits, 0)}
          </p>
        </div>
      </div>

      {/* TEAM TABLE */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Developer</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Commits</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">PRs</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Items</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Effort (hrs)</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.developer.id}
                onClick={() => onSelectDeveloper(row.developer)}
                className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors
                  ${row.anomaly.hasAnomaly ? 'bg-red-50' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {row.developer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{row.developer.name}</p>
                      <p className="text-xs text-gray-400">{row.developer.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {row.loading
                    ? <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"/>
                    : <span className={`font-semibold text-sm ${row.commits === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                        {row.commits}
                      </span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  {row.loading
                    ? <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"/>
                    : <span className={`font-semibold text-sm ${row.prs === 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                        {row.prs}
                      </span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  {row.loading
                    ? <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"/>
                    : <span className="font-semibold text-sm text-gray-900">{row.workItems}</span>
                  }
                </td>
                <td className="px-4 py-3 text-center">
                  {row.loading
                    ? <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"/>
                    : <span className={`font-semibold text-sm
                        ${row.effort < 1 || row.effort > 3
                          ? 'text-red-500'
                          : 'text-green-600'}`}>
                        {row.effort.toFixed(1)}
                      </span>
                  }
                </td>
                <td className="px-4 py-3">
                  {row.loading
                    ? <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto"/>
                    : <AnomalyBadge anomaly={row.anomaly} compact />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}