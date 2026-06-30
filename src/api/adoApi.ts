import * as SDK from 'azure-devops-extension-sdk'
import { getClient } from "azure-devops-extension-api"
import { GitRestClient } from "azure-devops-extension-api/Git"
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface WorkItemDetail {
  id:         number
  title:      string
  state:      string
  effort:     number
  changedDate: string
}

export interface CommitDetail {
  commitId: string
  comment:  string
  date:     string
}

export interface PrDetail {
  pullRequestId: number
  title:         string
  status:        string
  creationDate:  string
}

export interface Contributor {
  key:         string
  displayName: string
  email:       string
  commits:     CommitDetail[]
  prs:         PrDetail[]
  workItems:   WorkItemDetail[]
  totalEffortHours: number
}

// ─────────────────────────────────────────────
// Identity normalization
// ─────────────────────────────────────────────

function normalizeIdentity(raw: string | undefined | null): string {
  if (!raw) return ''
  const stripped = raw.includes('\\') ? raw.split('\\')[1] : raw
  return stripped.trim().toLowerCase()
}

// ─────────────────────────────────────────────
// Context + date helpers
// ─────────────────────────────────────────────

export async function getCurrentProject() {
  await SDK.ready()
  return SDK.getWebContext().project
}

export function buildDateFilter(range: 'today' | 'week' | 'month'): string {
  const now   = new Date()
  const start = new Date()

  if (range === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (range === 'week') {
    start.setDate(now.getDate() - 7)
  } else {
    start.setMonth(now.getMonth() - 1)
  }

  return start.toISOString()
}

function buildWiqlDateFilter(range: 'today' | 'week' | 'month'): string {
  return buildDateFilter(range).split('T')[0]
}

// ─────────────────────────────────────────────
// Working-hours expectation calculator
// Mon–Sat, 8 hrs/day, fixed math (no holiday calendar)
// ─────────────────────────────────────────────

export function getExpectedWorkingHours(dateRange: 'today' | 'week' | 'month'): number {
  if (dateRange === 'today') return 8
  if (dateRange === 'week')  return 40   // 5 days × 8 hrs
  return 140                              // approx. 5-day week × 8 hrs, monthly baseline
}

// ─────────────────────────────────────────────
// Fetch ALL commits across ALL repos
// ─────────────────────────────────────────────

async function fetchAllCommits(dateRange:  PeriodInput) {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const gitClient = getClient(GitRestClient)
  const fromDate  = resolveFromDate(dateRange)

  const repos = await gitClient.getRepositories(context.project.id)
  const allCommits: any[] = []

  for (const repo of repos) {
    try {
      const commits = await gitClient.getCommits(
        repo.id,
        { fromDate } as any,
        context.project.id
      )
      allCommits.push(...commits)
    } catch {
      continue
    }
  }

  return allCommits
}

// ─────────────────────────────────────────────
// Fetch ALL PRs across ALL repos
// ─────────────────────────────────────────────

async function fetchAllPullRequests(dateRange:  PeriodInput) {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const gitClient = getClient(GitRestClient)
  const fromDate  = new Date(resolveFromDate(dateRange))

  const repos = await gitClient.getRepositories(context.project.id)
  const allPrs: any[] = []

  for (const repo of repos) {
    try {
      const prs = await gitClient.getPullRequests(
        repo.id,
        { status: 4 } as any, // 4 = All
        context.project.id
      )
      allPrs.push(...prs)
    } catch {
      continue
    }
  }

  return allPrs.filter((pr: any) => new Date(pr.creationDate) >= fromDate)
}

// ─────────────────────────────────────────────
// Fetch ALL work items changed in range
// ─────────────────────────────────────────────

async function fetchAllWorkItems(dateRange:  PeriodInput) {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const witClient = getClient(WorkItemTrackingRestClient)
  const fromDate  = resolveWiqlFromDate(dateRange)

  const wiql = {
  query: `SELECT [System.Id], [System.Title], [System.State],
                 [System.AssignedTo], [Microsoft.VSTS.Scheduling.Effort],
                 [System.ChangedDate]
          FROM WorkItems
          WHERE [System.TeamProject] = '${context.project.name}'
          AND   [System.ChangedDate] >= '${fromDate}'
          ORDER BY [System.ChangedDate] DESC`
}

  const queryResult = await witClient.queryByWiql(wiql, context.project.id)
  const ids = (queryResult.workItems || []).map(w => w.id)
  if (ids.length === 0) return []

  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50))
  }

  const allItems = []
  for (const chunk of chunks) 
    {
    const items = await witClient.getWorkItems(
      chunk,
      context.project.id,
      ['System.Title', 'System.State', 'System.AssignedTo', 'System.ChangedDate',
    'Microsoft.VSTS.Scheduling.Effort',
    'Microsoft.VSTS.Scheduling.CompletedWork',
    'Microsoft.VSTS.Scheduling.RemainingWork',
    'Microsoft.VSTS.Scheduling.OriginalEstimate',]
    )
    allItems.push(...items)
    
  }
  return allItems
}



// ─────────────────────────────────────────────
// Merge into contributor list — DERIVED FROM ACTIVITY ONLY
// No Team roster, no "external member" concept — Option A
// ─────────────────────────────────────────────

export async function fetchProjectContributors(
  dateRange:  PeriodInput
): Promise<Contributor[]> {

  const [commits, prs, workItems] = await Promise.all([
    fetchAllCommits(dateRange),
    fetchAllPullRequests(dateRange),
    fetchAllWorkItems(dateRange),
  ])

  const contributors = new Map<string, Contributor>()

  function ensure(key: string, displayName: string, email: string): Contributor {
    if (!contributors.has(key)) {
      contributors.set(key, {
        key, displayName, email,
        commits: [], prs: [], workItems: [],
        totalEffortHours: 0,
      })
    }
    return contributors.get(key)!
  }

  for (const c of commits) {
    const email = c.author?.email || ''
    const name  = c.author?.name  || email
    const key   = normalizeIdentity(email || name)
    if (!key) continue

    ensure(key, name, email).commits.push({
      commitId: c.commitId,
      comment:  c.comment,
      date:     c.author?.date,
    })
  }

  for (const pr of prs as any[]) {
    const email = pr.createdBy?.uniqueName  || ''
    const name  = pr.createdBy?.displayName || email
    const key   = normalizeIdentity(email || name)
    if (!key) continue

    ensure(key, name, email).prs.push({
      pullRequestId: pr.pullRequestId,
      title:         pr.title,
      status:        pr.status,
      creationDate:  pr.creationDate,
    })
  }
  for (const item of workItems as any[]) {
  const assignedTo = item.fields['System.AssignedTo']
  const email = assignedTo?.uniqueName  || ''
  const name  = assignedTo?.displayName || email
  const key   = normalizeIdentity(email || name)
  if (!key) continue

  const effort =
    item.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ??
    item.fields['Microsoft.VSTS.Scheduling.Effort'] ??
    item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] ??
    item.fields['Microsoft.VSTS.Scheduling.RemainingWork'] ??
    0

  const row = ensure(key, name, email)
  row.workItems.push({
    id:          item.id,
    title:       item.fields['System.Title'],
    state:       item.fields['System.State'],
    effort,
    changedDate: item.fields['System.ChangedDate'],
  })
  row.totalEffortHours += effort
}

  return Array.from(contributors.values())
}

// ─────────────────────────────────────────────
// Single-contributor detail — now just filters the
// already-fetched full dataset, same pattern as before
// ─────────────────────────────────────────────

export async function fetchContributorDetail(
  contributorKey: string,
  dateRange: PeriodInput
): Promise<Contributor | null> {
  const all = await fetchProjectContributors(dateRange)
  return all.find(c => c.key === contributorKey) || null
}

// ─────────────────────────────────────────────
// Custom date range support (additive — does not
// change behaviour of 'today' | 'week' | 'month')
// ─────────────────────────────────────────────

export interface CustomRange {
  from: string  // YYYY-MM-DD
  to:   string  // YYYY-MM-DD
}

export type PeriodInput = 'today' | 'week' | 'month' | CustomRange

function isCustomRange(period: PeriodInput): period is CustomRange {
  return typeof period === 'object' && 'from' in period
}

function resolveFromDate(period: PeriodInput): string {
  if (isCustomRange(period)) {
    return new Date(period.from).toISOString()
  }
  return buildDateFilter(period)
}

function resolveWiqlFromDate(period: PeriodInput): string {
  if (isCustomRange(period)) {
    return period.from // already YYYY-MM-DD
  }
  return buildWiqlDateFilter(period)
}


// ─────────────────────────────────────────────
// Score calculation — tentative weights,
// intentionally isolated so they're easy to tune
// without touching the formula logic itself
// ─────────────────────────────────────────────

export const SCORE_WEIGHTS = {
  perCommit:      2,
  perPR:          5,
  perWorkItem:    1,
  perEffortHour:  0.5,
  perAnomaly:    -8,
}

export interface ScoreBreakdown {
  commitsPoints:    number
  prsPoints:        number
  workItemsPoints:  number
  effortPoints:     number
  anomalyPoints:    number
  rawScore:         number
  score:            number   // normalised 0–100, filled in after all contributors are known
}




export function calculateRawScore(
  contributor: Contributor,
  anomalyItems: { type: string }[],
  expectedHours: number
): Omit<ScoreBreakdown, 'score'> {
  const commitsPoints   = contributor.commits.length * SCORE_WEIGHTS.perCommit
  const prsPoints       = contributor.prs.length * SCORE_WEIGHTS.perPR
  const workItemsPoints = contributor.workItems.length * SCORE_WEIGHTS.perWorkItem

  // Guard rail 1 — clip effort input before it enters the score.
  // Anything beyond 150% of expected hours contributes nothing extra,
  // so fabricated/erroneous over-logging can't inflate the score.
  const effortCeiling  = expectedHours * 1.5
  const clippedEffort  = Math.min(contributor.totalEffortHours, effortCeiling)
  const effortPoints   = clippedEffort * SCORE_WEIGHTS.perEffortHour

  // Guard rail 2 — working-hours anomalies get a severity-scaled
  // penalty instead of the flat per-anomaly cost, so a wildly
  // over-logged total is punished proportionally to how extreme it is.
  let anomalyPoints = 0
  for (const item of anomalyItems) {
    if (item.type === 'working_hours' && contributor.totalEffortHours > expectedHours) {
      const overagePercent = (contributor.totalEffortHours / expectedHours) * 100
      anomalyPoints -= Math.min(overagePercent * 0.5, 400)
    } else {
      anomalyPoints += SCORE_WEIGHTS.perAnomaly
    }
  }

  const rawScore = commitsPoints + prsPoints + workItemsPoints + effortPoints + anomalyPoints

  return { commitsPoints, prsPoints, workItemsPoints, effortPoints, anomalyPoints, rawScore }
}

export function normaliseScores(
  rawScores: number[]
): number[] {
  const maxRaw = Math.max(...rawScores, 1) // avoid divide-by-zero
  return rawScores.map(raw => {
    const normalised = (Math.max(raw, 0) / maxRaw) * 100
    return Math.round(Math.min(100, Math.max(0, normalised)))
  })
}