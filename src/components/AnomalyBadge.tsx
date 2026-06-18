import type { AnomalyResult } from '../types'

interface Props {
  anomaly: AnomalyResult
  compact?: boolean
}

export default function AnomalyBadge({ anomaly, compact = false }: Props) {
  if (anomaly.hasAnomaly) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
          🔴 Anomaly
        </span>
        {!compact && anomaly.reasons.map((reason, i) => (
          <span key={i} className="text-xs text-red-600 pl-1">
            • {reason}
          </span>
        ))}
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
      ✅ Normal
    </span>
  )
}