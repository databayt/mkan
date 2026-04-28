"use server"

import { auth } from "@/lib/auth"

interface ReportIssueInput {
  description: string
  pageUrl: string
  meta?: {
    viewport?: string
    direction?: string
    browser?: string
  }
}

export async function reportIssue(data: ReportIssueInput) {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
  const repo = process.env.GITHUB_REPO || "databayt/mkan"
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  }

  if (!token) throw new Error("Issue reporting is not configured")

  const desc = data.description.trim()
  const title = desc.length > 80 ? desc.slice(0, 77) + "..." : desc

  const session = await auth().catch(() => null)
  const reporter = session?.user
    ? `${session.user.name} (${session.user.email})`
    : "Anonymous"

  const body = [
    data.description,
    "",
    "---",
    "",
    `**Page**: ${data.pageUrl}`,
    `**Time**: ${new Date().toISOString()}`,
    `**Reporter**: ${reporter}`,
    data.meta?.browser && `**Browser**: ${data.meta.browser}`,
    data.meta?.viewport && `**Viewport**: ${data.meta.viewport}`,
    data.meta?.direction && `**Direction**: ${data.meta.direction}`,
  ]
    .filter(Boolean)
    .join("\n")

  const payload = { title, body, labels: ["report"] }

  let response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  // If 422 (label doesn't exist), create it then retry
  if (response.status === 422) {
    await fetch(`https://api.github.com/repos/${repo}/labels`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "report",
        color: "d93f0b",
        description: "User-reported issues",
      }),
    }).catch(() => {})

    response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(`[report-issue] GitHub API ${response.status}: ${text}`)
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const issueData = await response.json().catch(() => null)
  if (issueData?.comments_url) {
    fetch(issueData.comments_url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        body: "Received. This report is queued for automated review and fix. You'll be notified here when resolved.",
      }),
    }).catch(() => {})
  }
}
