import type { AnomalyResult } from '../types'

export function detectAnomalies(
  effortHours:   number,
  commitCount:   number,
  prCount:       number,
  workItemCount: number,
  dateRange:     'today' | 'week' | 'month'
): AnomalyResult {
  const reasons: string[] = []

  // Thresholds vary by date range
  const minEffort = dateRange === 'today' ? 1   : dateRange === 'week' ? 5   : 20
  const maxEffort = dateRange === 'today' ? 3   : dateRange === 'week' ? 15  : 60
  const minCommits = dateRange === 'today' ? 0  : dateRange === 'week' ? 1   : 4

  // Effort anomalies
  if (effortHours > 0 && effortHours < minEffort) {
    reasons.push(`Low effort: ${effortHours.toFixed(1)}h (min ${minEffort}h expected)`)
  }

  if (effortHours > maxEffort) {
    reasons.push(`High effort: ${effortHours.toFixed(1)}h (max ${maxEffort}h expected)`)
  }

  // Commit anomalies
  if (commitCount <= minCommits) {
    reasons.push(`Low commits: ${commitCount} commit${commitCount !== 1 ? 's' : ''}`)
  }

  // PR anomalies — only flag weekly and monthly
  if (dateRange !== 'today' && prCount === 0) {
    reasons.push('No pull requests raised')
  }

  // Work item anomalies
  if (workItemCount === 0) {
    reasons.push('No work item activity')
  }

  return {
    hasAnomaly:    reasons.length > 0,
    reasons,
    effortHours,
    commitCount,
    prCount,
    workItemCount,
  }
}