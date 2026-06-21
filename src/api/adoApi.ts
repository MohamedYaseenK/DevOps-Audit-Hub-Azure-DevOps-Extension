import * as SDK from 'azure-devops-extension-sdk'
import { getClient } from "azure-devops-extension-api"
import { CoreRestClient } from "azure-devops-extension-api/Core"
import { GitRestClient } from "azure-devops-extension-api/Git"
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking"
import type { WorkItem, Commit, PullRequest } from '../types'

// ─────────────────────────────────────────────
// Context helpers
// ─────────────────────────────────────────────

// Returns { id, name, uri } for the current project
export async function getCurrentProject() {
  await SDK.ready()
  return SDK.getWebContext().project
}

// ─────────────────────────────────────────────
// Date filtering
// ─────────────────────────────────────────────

// Build a full ISO datetime string based on range
// (used by Git APIs, which accept full timestamps)
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

// Build a date-ONLY string (YYYY-MM-DD) for WIQL queries
// WIQL date-precision comparisons reject any time component
function buildWiqlDateFilter(range: 'today' | 'week' | 'month'): string {
  return buildDateFilter(range).split('T')[0]
}

// ─────────────────────────────────────────────
// Team members
// ─────────────────────────────────────────────

export async function fetchTeamMembers() {
  await SDK.ready()

  const context     = SDK.getWebContext()
  const coreClient  = getClient(CoreRestClient)

  const teams = await coreClient.getTeams(context.project.id)

  if (!teams.length) {
    return []
  }

  const team = teams[0]

  const members = await coreClient.getTeamMembersWithExtendedProperties(
    context.project.id,
    team.id
  )

  return members || []
}

// ─────────────────────────────────────────────
// Commits
// ─────────────────────────────────────────────

export async function fetchCommits(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<Commit[]> {
  await SDK.ready()

  const context    = SDK.getWebContext()
  const gitClient  = getClient(GitRestClient)
  const fromDate   = buildDateFilter(dateRange)

  const repos = await gitClient.getRepositories(context.project.id)

  const allCommits: Commit[] = []

  for (const repo of repos) {
    const commits = await gitClient.getCommits(
      repo.id,
      {
        author:   email,
        fromDate: fromDate,
      } as any,
      context.project.id
    )

    allCommits.push(
      ...commits.map((c: any) => ({
        commitId:    c.commitId,
        author:      c.author?.name,
        authorEmail: c.author?.email,
        comment:     c.comment,
        date:        c.author?.date,
      }))
    )
  }

  return allCommits
}

// ─────────────────────────────────────────────
// Pull Requests
// ─────────────────────────────────────────────

export async function fetchPullRequests(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<PullRequest[]> {
  await SDK.ready()

  const context    = SDK.getWebContext()
  const gitClient  = getClient(GitRestClient)
  const fromDate   = new Date(buildDateFilter(dateRange))

  const prs = await gitClient.getPullRequestsByProject(
    context.project.id,
    { status: 0 } as any // 0 = all statuses
  )

  return prs
    .filter((pr: any) => {
      const createdDate = new Date(pr.creationDate)
      return pr.createdBy?.uniqueName === email
          && createdDate >= fromDate
    })
    .map((pr: any) => ({
      pullRequestId: pr.pullRequestId,
      title:         pr.title,
      createdBy:     pr.createdBy?.displayName,
      status:        pr.status,
      creationDate:  pr.creationDate,
    }))
}

// ─────────────────────────────────────────────
// Work Items
// ─────────────────────────────────────────────

export async function fetchWorkItems(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<WorkItem[]> {
  await SDK.ready()

  const context   = SDK.getWebContext()
  const witClient = getClient(WorkItemTrackingRestClient)
  const fromDate  = buildWiqlDateFilter(dateRange)

  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State],
                   [System.AssignedTo], [Microsoft.VSTS.Scheduling.Effort]
            FROM WorkItems
            WHERE [System.AssignedTo] = '${email}'
            AND   [System.ChangedDate] >= '${fromDate}'
            AND   [System.TeamProject] = '${context.project.name}'
            ORDER BY [System.ChangedDate] DESC`
  }

  const queryResult = await witClient.queryByWiql(wiql, context.project.id)
  const ids = (queryResult.workItems || []).map(w => w.id)

  if (ids.length === 0) return []

  const items = await witClient.getWorkItems(
    ids.slice(0, 50),
    'System.Title,System.State,System.AssignedTo,Microsoft.VSTS.Scheduling.Effort'
  )

  return items.map(item => ({
    id:         item.id,
    title:      item.fields['System.Title'],
    state:      item.fields['System.State'],
    assignedTo: item.fields['System.AssignedTo']?.displayName || '',
    effort:     item.fields['Microsoft.VSTS.Scheduling.Effort'] || 0,
  }))
}