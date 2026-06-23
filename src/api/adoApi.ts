import * as SDK from 'azure-devops-extension-sdk'
import { getClient } from "azure-devops-extension-api"
import { CoreRestClient } from "azure-devops-extension-api/Core"
import { GitRestClient } from "azure-devops-extension-api/Git"
import { WorkItemTrackingRestClient } from "azure-devops-extension-api/WorkItemTracking"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface Contributor {
  key:          string          // normalized identity key — lowercase email
  displayName:  string
  email:        string
  isTeamMember: boolean         // true if found on any formal Team object
  commits:      number
  prs:          number
  workItems:    number
  effortHours:  number
}

// ─────────────────────────────────────────────
// Identity normalization
// ─────────────────────────────────────────────

// Commits, PRs, and Work Items each return identity in slightly
// different shapes. This collapses all of them into one comparable key.
function normalizeIdentity(raw: string | undefined | null): string {
  if (!raw) return ''
  // Strip domain-style logins (DOMAIN\username → username)
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
// Step 1 — fetch the formal Team roster
// Checks ALL teams in the project, not just the first one —
// ADO often has many auto-generated area-path teams, and the
// first team in the list is frequently empty.
// ─────────────────────────────────────────────

async function fetchTeamRoster(): Promise<Map<string, { displayName: string, email: string }>> {
  await SDK.ready()
  const context    = SDK.getWebContext()
  const coreClient = getClient(CoreRestClient)

  const roster = new Map<string, { displayName: string, email: string }>()

  const teams = await coreClient.getTeams(context.project.id)
  console.log('[DEBUG] teams found:', teams.length, teams.map(t => t.name))

  if (!teams.length) return roster

  for (const team of teams) {
    try {
      const members = await coreClient.getTeamMembersWithExtendedProperties(
        context.project.id,
        team.id
      )

      console.log(`[DEBUG] team "${team.name}" members:`, members.length)

      for (const m of members) {
        const email = m.identity?.uniqueName || ''
        const key   = normalizeIdentity(email)
        if (!key) continue

        roster.set(key, {
          displayName: m.identity?.displayName || email,
          email,
        })
      }
    } catch (err) {
      console.warn(`[DEBUG] could not read members for team "${team.name}":`, err)
      continue  // some teams may be restricted — skip and keep going
    }
  }

  console.log('[DEBUG] total unique roster members across all teams:', roster.size)
  return roster
}

// ─────────────────────────────────────────────
// Step 2 — fetch ALL commits across ALL repos
// (single pass, not per-developer)
// ─────────────────────────────────────────────

async function fetchAllCommits(dateRange: 'today' | 'week' | 'month') {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const gitClient = getClient(GitRestClient)
  const fromDate  = buildDateFilter(dateRange)

  const repos = await gitClient.getRepositories(context.project.id)
  console.log('[DEBUG] repos found:', repos.length, repos.map(r => r.name))

  const allCommits: any[] = []

  for (const repo of repos) {
    try {
      const commits = await gitClient.getCommits(
        repo.id,
        { fromDate } as any,
        context.project.id
      )
      console.log(`[DEBUG] repo "${repo.name}" commits:`, commits.length)
      allCommits.push(...commits)
    } catch (err) {
      console.warn(`[DEBUG] could not read commits for repo "${repo.name}":`, err)
      continue  // repo might be empty, disabled, or restricted — skip it
    }
  }

  console.log('[DEBUG] total commits across all repos:', allCommits.length)
  return allCommits
}

// ─────────────────────────────────────────────
// Step 3 — fetch ALL PRs across ALL repos
// ─────────────────────────────────────────────

async function fetchAllPullRequests(dateRange: 'today' | 'week' | 'month') {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const gitClient  = getClient(GitRestClient)
  const fromDate   = new Date(buildDateFilter(dateRange))

  const repos = await gitClient.getRepositories(context.project.id)
  console.log('[DEBUG] fetching PRs across repos:', repos.length)

  const allPrs: any[] = []

  for (const repo of repos) {
    try {
      const prs = await gitClient.getPullRequests(
        repo.id,
        { status: 4 } as any,   // 4 = All (not 0)
        context.project.id
      )
      allPrs.push(...prs)
    } catch (err) {
      console.warn(`[DEBUG] could not read PRs for repo "${repo.name}":`, err)
      continue
    }
  }

  console.log('[DEBUG] PRs found (all time, before date filter):', allPrs.length)
  const filtered = allPrs.filter((pr: any) => new Date(pr.creationDate) >= fromDate)
  console.log('[DEBUG] PRs after date filter:', filtered.length)

  return filtered
}

// ─────────────────────────────────────────────
// Step 4 — fetch ALL work items changed in range
// (project-wide, not filtered by assignee)
// ─────────────────────────────────────────────

async function fetchAllWorkItems(dateRange: 'today' | 'week' | 'month') {
  await SDK.ready()
  const context   = SDK.getWebContext()
  const witClient = getClient(WorkItemTrackingRestClient)
  const fromDate  = buildWiqlDateFilter(dateRange)

  const wiql = {
    query: `SELECT [System.Id], [System.Title], [System.State],
                   [System.AssignedTo], [Microsoft.VSTS.Scheduling.Effort]
            FROM WorkItems
            WHERE [System.ChangedDate] >= '${fromDate}'
            ORDER BY [System.ChangedDate] DESC`
  }

  const queryResult = await witClient.queryByWiql(wiql, context.project.id)
  const ids = (queryResult.workItems || []).map(w => w.id)

  console.log('[DEBUG] work item IDs from WIQL query:', ids.length)

  if (ids.length === 0) return []

  // ADO caps batch reads at 200 ids — chunk safely below that
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50))
  }

  const allItems = []
  for (const chunk of chunks) {
    const items = await witClient.getWorkItems(
      chunk,
      context.project.id,
      ['System.Title', 'System.State', 'System.AssignedTo', 'Microsoft.VSTS.Scheduling.Effort']
    )
    allItems.push(...items)
  }

  console.log('[DEBUG] work items fully fetched:', allItems.length)
  return allItems
}




// ─────────────────────────────────────────────
// Step 5 — merge everything into one contributor list
// ─────────────────────────────────────────────

export async function fetchProjectContributors(
  dateRange: 'today' | 'week' | 'month'
): Promise<Contributor[]> {

  console.log('═══════════════════════════════════════════')
  console.log('[DEBUG] fetchProjectContributors starting — dateRange:', dateRange)
  console.log('═══════════════════════════════════════════')

  const [roster, commits, prs, workItems] = await Promise.all([
    fetchTeamRoster(),
    fetchAllCommits(dateRange),
    fetchAllPullRequests(dateRange),
    fetchAllWorkItems(dateRange),
  ])

  console.log('───────────────────────────────────────────')
  console.log('[DEBUG] SUMMARY')
  console.log('[DEBUG] roster size:    ', roster.size)
  console.log('[DEBUG] commits count:  ', commits.length)
  console.log('[DEBUG] prs count:      ', prs.length)
  console.log('[DEBUG] workItems count:', workItems.length)
  console.log('[DEBUG] sample commit:  ', commits[0])
  console.log('[DEBUG] sample pr:      ', prs[0])
  console.log('───────────────────────────────────────────')

  // Master map — starts with the team roster, gets enriched with activity
  const contributors = new Map<string, Contributor>()

  // Seed with formal team members first
  for (const [key, info] of roster) {
    contributors.set(key, {
      key,
      displayName:  info.displayName,
      email:        info.email,
      isTeamMember: true,
      commits:      0,
      prs:          0,
      workItems:    0,
      effortHours:  0,
    })
  }

  // Fold in commits
  for (const c of commits) {
    const email = c.author?.email || ''
    const name  = c.author?.name  || email
    const key   = normalizeIdentity(email || name)
    if (!key) continue

    if (!contributors.has(key)) {
      contributors.set(key, {
        key, displayName: name, email,
        isTeamMember: false,
        commits: 0, prs: 0, workItems: 0, effortHours: 0,
      })
    }
    contributors.get(key)!.commits += 1
  }

  // Fold in PRs
  for (const pr of prs as any[]) {
    const email = pr.createdBy?.uniqueName   || ''
    const name  = pr.createdBy?.displayName  || email
    const key   = normalizeIdentity(email || name)
    if (!key) continue

    if (!contributors.has(key)) {
      contributors.set(key, {
        key, displayName: name, email,
        isTeamMember: false,
        commits: 0, prs: 0, workItems: 0, effortHours: 0,
      })
    }
    contributors.get(key)!.prs += 1
  }

  // Fold in work items + effort
  for (const item of workItems as any[]) {
    const assignedTo = item.fields['System.AssignedTo']
    const email = assignedTo?.uniqueName  || ''
    const name  = assignedTo?.displayName || email
    const key   = normalizeIdentity(email || name)
    if (!key) continue

    if (!contributors.has(key)) {
      contributors.set(key, {
        key, displayName: name, email,
        isTeamMember: false,
        commits: 0, prs: 0, workItems: 0, effortHours: 0,
      })
    }

    const row = contributors.get(key)!
    row.workItems   += 1
    row.effortHours += item.fields['Microsoft.VSTS.Scheduling.Effort'] || 0
  }

  const result = Array.from(contributors.values())
  console.log('[DEBUG] final merged contributor count:', result.length)
  console.log('═══════════════════════════════════════════')

  return result
}

// ─────────────────────────────────────────────
// Step 6 — fetch detail (commit messages, PR titles)
// for ONE contributor, by their normalized key
// ─────────────────────────────────────────────

export async function fetchContributorDetail(
  contributorKey: string,
  dateRange: 'today' | 'week' | 'month'
) {
  const [commits, prs, workItems] = await Promise.all([
    fetchAllCommits(dateRange),
    fetchAllPullRequests(dateRange),
    fetchAllWorkItems(dateRange),
  ])

  const myCommits = commits.filter((c: any) => {
    const key = normalizeIdentity(c.author?.email || c.author?.name)
    return key === contributorKey
  })

  const myPrs = (prs as any[]).filter((pr) => {
    const key = normalizeIdentity(pr.createdBy?.uniqueName || pr.createdBy?.displayName)
    return key === contributorKey
  })

  const myWorkItems = (workItems as any[]).filter((item) => {
    const assignedTo = item.fields['System.AssignedTo']
    const key = normalizeIdentity(assignedTo?.uniqueName || assignedTo?.displayName)
    return key === contributorKey
  })

  console.log(`[DEBUG] detail for "${contributorKey}" — commits: ${myCommits.length}, prs: ${myPrs.length}, workItems: ${myWorkItems.length}`)

  return {
    commits: myCommits.map((c: any) => ({
      commitId: c.commitId,
      comment:  c.comment,
      date:     c.author?.date,
    })),
    prs: myPrs.map((pr: any) => ({
      pullRequestId: pr.pullRequestId,
      title:         pr.title,
      status:        pr.status,
      creationDate:  pr.creationDate,
    })),
    workItems: myWorkItems.map((item: any) => ({
      id:     item.id,
      title:  item.fields['System.Title'],
      state:  item.fields['System.State'],
      effort: item.fields['Microsoft.VSTS.Scheduling.Effort'] || 0,
    })),
  }
}