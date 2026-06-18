import { useEffect, useState } from 'react'
import type { Developer, Commit, PullRequest, WorkItem, AnomalyResult } from '../types'
import { fetchCommits, fetchPullRequests, fetchWorkItems } from '../api/adoApi'
import { detectAnomalies } from '../anomaly/detector'
import AnomalyBadge from './AnomalyBadge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'

interface Props {
  developer: Developer
  dateRange: 'today' | 'week' | 'month'
}

export default function DeveloperView({ developer, dateRange }: Props) {
  const [commits,   setCommits]   = useState<Commit[]>([])
  const [prs,       setPrs]       = useState<PullRequest[]>([])
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [anomaly,   setAnomaly]   = useState<AnomalyResult | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [developer.email, dateRange])

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const [c, p, w] = await Promise.all([
        fetchCommits(developer.email, dateRange),
        fetchPullRequests(developer.email, dateRange),
        fetchWorkItems(developer.email, dateRange),
      ])

      setCommits(c)
      setPrs(p)
      setWorkItems(w)

      const effort  = w.reduce((sum, wi) => sum + (wi.effort || 0), 0)
      setAnomaly(detectAnomalies(effort, c.length, p.length, w.length, dateRange))

    } catch (err) {
      setError('Failed to load developer data.')
    } finally {
      setLoading(false)
    }
  }

  // Build chart data — commits grouped by date
  function buildChartData() {
    const grouped: Record<string, number> = {}
    commits.forEach(c => {
      const date = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      grouped[date] = (grouped[date] || 0) + 1
    })
    return Object.entries(grouped).map(([date, count]) => ({ date, commits: count }))
  }

  const effort     = workItems.reduce((sum, wi) => sum + (wi.effort || 0), 0)
  const chartData  = buildChartData()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
          <p className="text-gray-500 text-sm">Loading {developer.name}'s activity...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600">{error}</p>
        <button onClick={loadData} className="mt-3 text-sm text-red-500 underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* DEVELOPER HEADER */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-bold">
              {developer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{developer.name}</h2>
              <p className="text-sm text-gray-500">{developer.email}</p>
            </div>
          </div>
          {anomaly && <AnomalyBadge anomaly={anomaly} />}
        </div>
      </div>

      {/* SUMMARY METRICS */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Commits</p>
          <p className={`text-3xl font-bold mt-1 ${commits.length === 0 ? 'text-red-500' : 'text-gray-900'}`}>
            {commits.length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Pull Requests</p>
          <p className={`text-3xl font-bold mt-1 ${prs.length === 0 ? 'text-orange-500' : 'text-gray-900'}`}>
            {prs.length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Work Items</p>
          <p className={`text-3xl font-bold mt-1 ${workItems.length === 0 ? 'text-red-500' : 'text-gray-900'}`}>
            {workItems.length}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Effort (hrs)</p>
          <p className={`text-3xl font-bold mt-1
            ${effort < 1 || effort > 3 ? 'text-red-500' : 'text-green-600'}`}>
            {effort.toFixed(1)}
          </p>
        </div>
      </div>

      {/* COMMIT CHART */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Commit Activity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }}/>
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false}/>
              <Tooltip/>
              <Bar dataKey="commits" fill="#2563eb" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* WORK ITEMS */}
      {workItems.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Work Items</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 text-xs text-gray-500">Title</th>
                <th className="text-center px-4 py-2 text-xs text-gray-500">State</th>
                <th className="text-center px-4 py-2 text-xs text-gray-500">Effort</th>
              </tr>
            </thead>
            <tbody>
              {workItems.map(wi => (
                <tr key={wi.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-sm text-gray-800">{wi.title}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium
                      ${wi.state === 'Done' || wi.state === 'Closed'
                        ? 'bg-green-100 text-green-700'
                        : wi.state === 'Active' || wi.state === 'In Progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'}`}>
                      {wi.state}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center text-sm text-gray-600">
                    {wi.effort ? `${wi.effort}h` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RECENT COMMITS */}
      {commits.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Recent Commits</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {commits.slice(0, 10).map(c => (
              <div key={c.commitId} className="px-4 py-3">
                <p className="text-sm text-gray-800 font-medium">{c.comment}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(c.date).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PULL REQUESTS */}
      {prs.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Pull Requests</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {prs.map(pr => (
              <div key={pr.pullRequestId} className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-800">{pr.title}</p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium
                  ${pr.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : pr.status === 'active'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'}`}>
                  {pr.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}