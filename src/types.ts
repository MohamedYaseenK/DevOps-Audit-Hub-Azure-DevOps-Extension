// Developer shape used across all components
export interface Developer {
  id:          string
  name:        string
  email:       string
  imageUrl?:   string
}

// Work item from ADO REST API
export interface WorkItem {
  id:          number
  title:       string
  state:       string
  assignedTo:  string
  effort?:     number        // hours — from Story Points field
  closedDate?: string
}

// Commit from ADO REST API
export interface Commit {
  commitId:    string
  author:      string
  authorEmail: string
  comment:     string
  date:        string
}

// Pull request from ADO REST API
export interface PullRequest {
  pullRequestId: number
  title:         string
  createdBy:     string
  status:        string
  creationDate:  string
}

// Anomaly result for one developer
export interface AnomalyResult {
  hasAnomaly:      boolean
  reasons:         string[]
  effortHours:     number
  commitCount:     number
  prCount:         number
  workItemCount:   number
}

// Date range type
export type DateRange = 'today' | 'week' | 'month'