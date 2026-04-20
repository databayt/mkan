"use server"

import { auth } from "@/lib/auth"

export async function reportIssue(data: {
  description: string
  pageUrl: string
  viewport?: string
  direction?: string
  browser?: string
}) {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN
  const repo = process.env.GITHUB_REPO || "databayt/mkan"

  if (!token) throw new Error("Issue reporting is not configured")

  const desc = data.description
  const truncated =
    desc.length > 80 ? desc.slice(0, 77) + "..." : desc
  const title = truncated

  // Reporter from auth session
  const session = await auth().catch(() => null)
  const reporter = session?.user
    ? `${session.user.name} (${session.user.email})`
    : "Anonymous"

  const body = [
    data.description,
    "",
    "---",
    "",
    `**Reporter**: ${reporter}`,
    `**Page**: \`${data.pageUrl}\``,
    data.viewport ? `**Viewport**: ${data.viewport}` : null,
    data.direction ? `**Direction**: ${data.direction}` : null,
    data.browser ? `**Browser**: ${data.browser}` : null,
    `**Time**: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n")

  // Try with label first, fall back without if label doesn't exist
  const payload: Record<string, unknown> = { title, body, labels: ["report"] }

  let response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify(payload),
  })

  // If 422 (label doesn't exist), retry without labels
  if (response.status === 422) {
    delete payload.labels
    response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify(payload),
    })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    console.error(`[report-issue] GitHub API ${response.status}: ${text}`)
    throw new Error(`GitHub API error: ${response.status}`)
  }

  // Acknowledgment comment (fire-and-forget)
  const issueData = await response.json().catch(() => null)
  if (issueData?.comments_url) {
    fetch(issueData.comments_url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({
        body: "Received. This report is queued for automated review and fix. You'll be notified here when resolved.",
      }),
    }).catch(() => {})
  }
}
