import { useState } from 'react'
import TeamView from './components/TeamView'
import DeveloperView from './components/DeveloperView'
import type { Developer } from './types'

type DateRange = 'today' | 'week' | 'month'

export default function App() {
  const [selectedDev, setSelectedDev] = useState<Developer | null>(null)
  const [dateRange, setDateRange]     = useState<DateRange>('today')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* TOP HEADER */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">

          {/* LEFT — title + back button */}
          <div className="flex items-center gap-4">
            {selectedDev && (
              <button
                onClick={() => setSelectedDev(null)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                ← Back to Team
              </button>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {selectedDev ? selectedDev.name : 'DevOps Audit Hub'}
              </h1>
              <p className="text-xs text-gray-500">
                {selectedDev
                  ? 'Developer Activity Detail'
                  : 'Team productivity monitoring and anomaly detection'}
              </p>
            </div>
          </div>

          {/* RIGHT — date range selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Period:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['today', 'week', 'month'] as DateRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors
                    ${dateRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  {range === 'today' ? 'Today'
                   : range === 'week' ? 'This Week'
                   : 'This Month'}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="px-6 py-6">
        {selectedDev
          ? <DeveloperView developer={selectedDev} dateRange={dateRange} />
          : <TeamView onSelectDeveloper={setSelectedDev} dateRange={dateRange} />
        }
      </div>

    </div>
  )
}