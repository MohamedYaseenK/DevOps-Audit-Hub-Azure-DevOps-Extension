import type { Commit, PullRequest, WorkItem } from '../types'
import * as SDK from 'azure-devops-extension-sdk'

// Get current project name from SDK context
export async function getCurrentProject(): Promise<string> {
  await SDK.ready()
  const context = SDK.getPageContext()
  return context.webContext.project.name
}

export async function getCurrentOrg(): Promise<string> {
  await SDK.ready()
  const navService = await SDK.getService<any>(
    'ms.vss-features.host-navigation-service'
  )
  const location = await navService.getPageRoute()
  if (location?.routeValues?.project) {
    return window.location.hostname.split('.')[0]
  }
  return window.location.hostname.split('.')[0]
}

// Build date filter string based on range
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

// Fetch all team members from ADO
export async function fetchTeamMembers(): Promise<any[]> {
  await SDK.ready()
  const token   = await SDK.getAccessToken()
  const org     = await getCurrentOrg()
  const project = await getCurrentProject()

  const response = await fetch(
    `https://dev.azure.com/${org}/_apis/projects/${project}/teams?api-version=7.1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      }
    }
  )

  const data = await response.json()
  if (!data.value || data.value.length === 0) return []

  const teamId = data.value[0].id

  const membersResponse = await fetch(
    `https://dev.azure.com/${org}/_apis/projects/${project}/teams/${teamId}/members?api-version=7.1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      }
    }
  )

  const membersData = await membersResponse.json()
  return membersData.value || []
}

// Fetch commits for a specific developer
export async function fetchCommits(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<Commit[]> {
  await SDK.ready()
  const token     = await SDK.getAccessToken()
  const org       = await getCurrentOrg()
  const project   = await getCurrentProject()
  const fromDate  = buildDateFilter(dateRange)

  const reposResponse = await fetch(
    `https://dev.azure.com/${org}/${project}/_apis/git/repositories?api-version=7.1`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  const reposData = await reposResponse.json()
  const repos     = reposData.value || []
  const allCommits: Commit[] = []

  for (const repo of repos) {
    const response = await fetch(
      `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo.id}/commits?searchCriteria.authorEmail=${email}&searchCriteria.fromDate=${fromDate}&api-version=7.1`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    )

    const data = await response.json()
    if (data.value) {
      allCommits.push(...data.value.map((c: any) => ({
        commitId:    c.commitId,
        author:      c.author.name,
        authorEmail: c.author.email,
        comment:     c.comment,
        date:        c.author.date,
      })))
    }
  }

  return allCommits
}

// Fetch pull requests for a specific developer
export async function fetchPullRequests(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<PullRequest[]> {
  await SDK.ready()
  const token    = await SDK.getAccessToken()
  const org      = await getCurrentOrg()
  const project  = await getCurrentProject()
  const fromDate = new Date(buildDateFilter(dateRange))

  const response = await fetch(
    `https://dev.azure.com/${org}/${project}/_apis/git/pullrequests?searchCriteria.status=all&api-version=7.1`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  const data = await response.json()
  const prs   = data.value || []

  return prs
    .filter((pr: any) => {
      const createdDate = new Date(pr.creationDate)
      return pr.createdBy.uniqueName === email
          && createdDate >= fromDate
    })
    .map((pr: any) => ({
      pullRequestId: pr.pullRequestId,
      title:         pr.title,
      createdBy:     pr.createdBy.displayName,
      status:        pr.status,
      creationDate:  pr.creationDate,
    }))
}

// Fetch work items for a specific developer
export async function fetchWorkItems(
  email:     string,
  dateRange: 'today' | 'week' | 'month'
): Promise<WorkItem[]> {
  await SDK.ready()
  const token    = await SDK.getAccessToken()
  const org      = await getCurrentOrg()
  const project  = await getCurrentProject()
  const fromDate = buildDateFilter(dateRange)

  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State],
                   [System.AssignedTo], [Microsoft.VSTS.Scheduling.Effort]
            FROM WorkItems
            WHERE [System.AssignedTo] = '${email}'
            AND   [System.ChangedDate] >= '${fromDate}'
            AND   [System.TeamProject] = '${project}'
            ORDER BY [System.ChangedDate] DESC`
  }

  const queryResponse = await fetch(
    `https://dev.azure.com/${org}/${project}/_apis/wit/wiql?api-version=7.1`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(wiql)
    }
  )

  const queryData = await queryResponse.json()
  const ids       = (queryData.workItems || []).map((w: any) => w.id)

  if (ids.length === 0) return []

  const detailsResponse = await fetch(
    `https://dev.azure.com/${org}/${project}/_apis/wit/workitems?ids=${ids.slice(0,50).join(',')}&fields=System.Id,System.Title,System.State,System.AssignedTo,Microsoft.VSTS.Scheduling.Effort&api-version=7.1`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  )

  const detailsData = await detailsResponse.json()

  return (detailsData.value || []).map((item: any) => ({
    id:         item.id,
    title:      item.fields['System.Title'],
    state:      item.fields['System.State'],
    assignedTo: item.fields['System.AssignedTo']?.displayName || '',
    effort:     item.fields['Microsoft.VSTS.Scheduling.Effort'] || 0,
  }))
}