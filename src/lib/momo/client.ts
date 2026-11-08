import "server-only"

import type { MomoConfig } from "./config"

/**
 * Thin MTN MoMo Collection client — token, Request to Pay, status read.
 * Errors surface as MomoError with an UPPER_CASE code; nothing here touches
 * the database.
 */

const TIMEOUT_MS = 15_000

export class MomoError extends Error {
  constructor(
    public code: "MOMO_UNAVAILABLE" | "MOMO_REJECTED" | "MOMO_NOT_FOUND",
    public status?: number,
    detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = "MomoError"
  }
}

/** MTN's request states, plus the failure kinds its reasons map to. */
export type PaymentAttemptStatus = "PENDING" | "SUCCESSFUL" | "FAILED" | "REJECTED" | "TIMEOUT"

export type MomoStatus = {
  status: PaymentAttemptStatus
  financialTransactionId: string | null
  reason: string | null
}

// The container is long-running, so one cached token serves every request
// until shortly before it expires (MTN issues 3600 s tokens).
let cached: { token: string; expiresAt: number; key: string } | null = null

export function resetMomoTokenCache() {
  cached = null
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" })
  } catch (error) {
    throw new MomoError("MOMO_UNAVAILABLE", undefined, error instanceof Error ? error.message : String(error))
  }
}

async function getToken(config: MomoConfig): Promise<string> {
  const key = `${config.baseUrl}|${config.apiUser}`
  if (cached && cached.key === key && cached.expiresAt > Date.now()) return cached.token

  const res = await call(`${config.baseUrl}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.apiUser}:${config.apiKey}`)}`,
      "Ocp-Apim-Subscription-Key": config.subscriptionKey,
    },
  })
  if (!res.ok) throw new MomoError("MOMO_UNAVAILABLE", res.status, "token")
  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new MomoError("MOMO_UNAVAILABLE", res.status, "token body")
  const ttl = Math.max(60, Number(body.expires_in) || 3600)
  cached = { token: body.access_token, expiresAt: Date.now() + (ttl - 60) * 1000, key }
  return body.access_token
}

function headers(config: MomoConfig, token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "X-Target-Environment": config.targetEnv,
    "Ocp-Apim-Subscription-Key": config.subscriptionKey,
  }
}

export function callbackFor(base: string, referenceId: string): string {
  const url = new URL(base)
  url.searchParams.set("ref", referenceId)
  return url.toString()
}

/**
 * Text shown on the payer's phone and statement. MTN's gateway WAF rejects
 * some punctuation outright — a "#" gets an HTML "Request Rejected" page
 * (HTTP 200, no prompt) — so only letters, digits, spaces, "." and "-" pass.
 */
export function payerText(message: string): string {
  return message.replace(/[^\p{L}\p{N} .-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 160)
}

/** Sends the "enter your PIN" prompt. MTN answers 202 and works async. */
export async function requestToPay(
  config: MomoConfig,
  input: { referenceId: string; amount: number; payer: string; externalId: string; message: string }
): Promise<void> {
  const token = await getToken(config)
  const res = await call(`${config.baseUrl}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers: {
      ...headers(config, token),
      "Content-Type": "application/json",
      "X-Reference-Id": input.referenceId,
      // MTN's callback body doesn't reliably echo our reference — carry it in the URL.
      ...(config.callbackUrl ? { "X-Callback-Url": callbackFor(config.callbackUrl, input.referenceId) } : {}),
    },
    body: JSON.stringify({
      amount: String(input.amount),
      currency: config.currency,
      externalId: input.externalId,
      payer: { partyIdType: "MSISDN", partyId: input.payer.replace(/^\+/, "") },
      // Shown on the payer's phone and statement; MTN caps these at 160.
      payerMessage: payerText(input.message),
      payeeNote: payerText(input.message),
    }),
  })
  if (res.status === 202) return
  if (res.status === 401) resetMomoTokenCache()
  // Anything but 202 means no prompt went out (a WAF block even answers 200).
  // 400/409 are our request (bad payer, duplicate reference); 5xx is MTN.
  throw new MomoError(res.status >= 500 || res.status === 401 ? "MOMO_UNAVAILABLE" : "MOMO_REJECTED", res.status)
}

/** MTN failure reasons that map to a clearer attempt status. */
const REASON_STATUS: Record<string, PaymentAttemptStatus> = {
  APPROVAL_REJECTED: "REJECTED",
  EXPIRED: "TIMEOUT",
  TRANSACTION_TIMEOUT: "TIMEOUT",
}

export function mapMomoStatus(body: {
  status?: string
  financialTransactionId?: string
  reason?: string | { code?: string; message?: string }
}): MomoStatus {
  const reason = typeof body.reason === "string" ? body.reason : (body.reason?.code ?? null)
  const raw = (body.status ?? "").toUpperCase()
  const status: PaymentAttemptStatus =
    raw === "SUCCESSFUL"
      ? "SUCCESSFUL"
      : raw === "FAILED" || raw === "REJECTED" || raw === "TIMEOUT"
        ? ((reason ? REASON_STATUS[reason] : undefined) ?? raw)
        : "PENDING"
  return {
    status,
    financialTransactionId: status === "SUCCESSFUL" ? (body.financialTransactionId ?? null) : null,
    reason: status === "PENDING" || status === "SUCCESSFUL" ? null : reason,
  }
}

/** Reads the request's real state from MTN — the only source we trust. */
export async function getRequestToPayStatus(config: MomoConfig, referenceId: string): Promise<MomoStatus> {
  const token = await getToken(config)
  const res = await call(`${config.baseUrl}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
    method: "GET",
    headers: headers(config, token),
  })
  if (res.status === 404) throw new MomoError("MOMO_NOT_FOUND", 404)
  if (res.status === 401) resetMomoTokenCache()
  if (!res.ok) throw new MomoError("MOMO_UNAVAILABLE", res.status)
  return mapMomoStatus(await res.json())
}
