import { useState } from 'react'
import TeamView from './components/TeamView'
import DeveloperView from './components/DeveloperView'
import type { Developer } from './types'
import type { CustomRange, PeriodInput } from './api/adoApi'

type Preset = 'today' | 'week' | 'month'

const RANGE_LABEL: Record<Preset, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
}

function isCustom(period: PeriodInput): period is CustomRange {
  return typeof period === 'object'
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

export default function App() {
  const [selectedDev, setSelectedDev] = useState<Developer | null>(null)
  const [dateRange, setDateRange]     = useState<PeriodInput>('today')
  const [customOpen, setCustomOpen]   = useState(false)
  const [draftFrom, setDraftFrom]     = useState(todayStr())
  const [draftTo,   setDraftTo]       = useState(todayStr())
  const [rangeError, setRangeError]   = useState<string | null>(null)

  function applyCustomRange() {
    const from = new Date(draftFrom)
    const to   = new Date(draftTo)

    if (from > to) {
      setRangeError('Start date must be before end date.')
      return
    }
    const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
    if (days > 90) {
      setRangeError('Custom range cannot exceed 90 days.')
      return
    }

    setRangeError(null)
    setDateRange({ from: draftFrom, to: draftTo })
    setCustomOpen(false)
  }

  function selectPreset(preset: Preset) {
    setDateRange(preset)
    setCustomOpen(false)
  }

  const customLabel = isCustom(dateRange)
    ? `${dateRange.from} → ${dateRange.to}`
    : null

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#1B1A19]" onClick={() => setCustomOpen(false)}>

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

          {/* RIGHT — date range selector */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-medium text-[#605E5C] uppercase tracking-wide">Period</span>

            <div className="flex items-center gap-1 rounded-lg border border-[#E1E1E1] bg-[#FAFAFA] p-1">
              {(['today', 'week', 'month'] as Preset[]).map(preset => (
                <button
                  key={preset}
                  onClick={() => selectPreset(preset)}
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]
                    ${!isCustom(dateRange) && dateRange === preset
                      ? 'bg-[#0078D4] text-white shadow-sm'
                      : 'text-[#605E5C] hover:bg-white hover:text-[#1B1A19]'
                    }`}
                >
                  {RANGE_LABEL[preset]}
                </button>
              ))}

              {/* Custom range trigger */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setCustomOpen(o => !o)}
                  aria-label="Custom date range"
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0078D4]
                    ${isCustom(dateRange)
                      ? 'bg-[#0078D4] text-white shadow-sm'
                      : 'text-[#605E5C] hover:bg-white hover:text-[#1B1A19]'
                    }`}
                >
                  <span aria-hidden="true">📅</span>
                  {customLabel ?? 'Custom'}
                </button>

                {customOpen && (
                  <div className="absolute z-20 top-full right-0 mt-2 w-64 bg-white border border-[#E1E1E1] rounded-lg shadow-lg p-4">
                    <p className="text-[10px] font-semibold text-[#605E5C] uppercase tracking-wide mb-3">
                      Custom date range
                    </p>

                    <label className="block text-xs text-[#605E5C] mb-1">From</label>
                    <input
                      type="date"
                      value={draftFrom}
                      max={draftTo}
                      onChange={e => setDraftFrom(e.target.value)}
                      className="w-full mb-3 px-2.5 py-1.5 text-sm border border-[#E1E1E1] rounded-md
                                 focus:outline-none focus:border-[#0078D4]"
                    />

                    <label className="block text-xs text-[#605E5C] mb-1">To</label>
                    <input
                      type="date"
                      value={draftTo}
                      min={draftFrom}
                      max={todayStr()}
                      onChange={e => setDraftTo(e.target.value)}
                      className="w-full mb-2 px-2.5 py-1.5 text-sm border border-[#E1E1E1] rounded-md
                                 focus:outline-none focus:border-[#0078D4]"
                    />

                    {rangeError && (
                      <p className="text-xs text-[#D13438] mb-2">{rangeError}</p>
                    )}
                    <p className="text-[11px] text-[#A19F9D] mb-3">Maximum range: 90 days</p>

                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => { setCustomOpen(false); setRangeError(null) }}
                        className="text-xs text-[#605E5C] hover:text-[#1B1A19]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={applyCustomRange}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0078D4] text-white hover:bg-[#0A4C8C] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="px-6 py-6 w-full max-w-none">
        {selectedDev
          ? <DeveloperView developer={selectedDev} dateRange={dateRange} />
          : <TeamView onSelectDeveloper={setSelectedDev} dateRange={dateRange} />
        }
      </div>

    </div>
  )
}