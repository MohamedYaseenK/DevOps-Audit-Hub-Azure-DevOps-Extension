import { useState } from 'react'
import TeamView from './components/TeamView'
import DeveloperView from './components/DeveloperView'
import type { Developer } from './types'

type DateRange = 'today' | 'week' | 'month'

const RANGE_LABEL: Record<DateRange, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
}

export default function App() {
  const [selectedDev, setSelectedDev] = useState<Developer | null>(null)
  const [dateRange, setDateRange]     = useState<DateRange>('today')

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#1B1A19]">

      {/* TOP HEADER */}
      <div className="bg-white border-b border-[#E1E1E1]">
        <div className="px-6 py-4 flex items-center justify-between gap-6 flex-wrap">

          {/* LEFT — title + back button */}
          <div className="flex items-center gap-4 min-w-0">
            {selectedDev && (
              <button
                onClick={() => setSelectedDev(null)}
                className="flex items-center gap-1.5 text-[#0078D4] hover:text-[#0A4C8C] text-sm font-medium shrink-0
                           rounded-md px-2 py-1.5 -ml-2 hover:bg-[#EFF6FC] transition-colors
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]"
              >
                <span aria-hidden="true">←</span> Back to Team
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-[#1B1A19] truncate">
                {selectedDev ? selectedDev.name : 'DevOps Audit Hub'}
              </h1>
              <p className="text-xs text-[#605E5C] mt-0.5">
                {selectedDev
                  ? 'Developer activity detail'
                  : 'Team productivity monitoring and anomaly detection'}
              </p>
            </div>
          </div>

          {/* RIGHT — date range selector (segmented control) */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">Period</span>
            <div
              role="tablist"
              aria-label="Reporting period"
              className="flex items-center gap-1 rounded-lg border border-[#E1E1E1] bg-[#FAFAFA] p-1"
            >
              {(['today', 'week', 'month'] as DateRange[]).map(range => (
                <button
                  key={range}
                  role="tab"
                  aria-selected={dateRange === range}
                  onClick={() => setDateRange(range)}
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]
                    ${dateRange === range
                      ? 'bg-[#0078D4] text-white shadow-sm'
                      : 'text-[#605E5C] hover:bg-white hover:text-[#1B1A19]'
                    }`}
                >
                  {RANGE_LABEL[range]}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="px-6 py-6 max-w-[1400px] mx-auto">
        {selectedDev
          ? <DeveloperView developer={selectedDev} dateRange={dateRange} />
          : <TeamView onSelectDeveloper={setSelectedDev} dateRange={dateRange} />
        }
      </div>

    </div>
  )
}