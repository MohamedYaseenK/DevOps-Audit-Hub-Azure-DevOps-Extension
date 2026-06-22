import { useEffect, useState } from 'react'
import { fetchProjectContributors, type Contributor } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import AnomalyBadge from './AnomalyBadge'
import type { Developer, AnomalyResult } from '../types'

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
        anomaly: detectAnomalies(
          c.effortHours,
          c.commits,
          c.prs,
          c.workItems,
          dateRange
        ),
      }))

      setRows(built)
    } catch (err) {
      setError('Failed to load team data. Check your ADO connection.')
    } finally {
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
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Contributors</p>
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
            {rows.reduce((sum, r) => sum + r.contributor.commits, 0)}
          </p>
        </div>
      </div>

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
                key={row.contributor.key}
                onClick={() => onSelectDeveloper({
                  id:    row.contributor.key,
                  name:  row.contributor.displayName,
                  email: row.contributor.email,
                })}
                className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors
                  ${row.anomaly.hasAnomaly ? 'bg-red-50' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                      {row.contributor.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">
                        {row.contributor.displayName}
                        {!row.contributor.isTeamMember && (
                          <span className="ml-2 text-xs text-blue-500 font-normal">external</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">{row.contributor.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-semibold text-sm ${row.contributor.commits === 0 ? 'text-red-500' : 'text-gray-900'}`}>
                    {row.contributor.commits}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-semibold text-sm ${row.contributor.prs === 0 ? 'text-orange-500' : 'text-gray-900'}`}>
                    {row.contributor.prs}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="font-semibold text-sm text-gray-900">{row.contributor.workItems}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`font-semibold text-sm
                    ${row.contributor.effortHours < 1 || row.contributor.effortHours > 3
                      ? 'text-red-500'
                      : 'text-green-600'}`}>
                    {row.contributor.effortHours.toFixed(1)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <AnomalyBadge anomaly={row.anomaly} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}