import "server-only"

import { normalizePhone } from "@/lib/phone"

/**
 * MTN MoMo Collection ("Request to Pay") settings, all from the central env
 * (ported from ~/food, 2026-11-08). With no keys the feature is off.
 * Sandbox: https://sandbox.momodeveloper.mtn.com, target "sandbox", currency EUR.
 * Production Rwanda: target "mtnrwanda", currency RWF — refused until the
 * "MoMo API live" setup step is ticked (share.ts `momoGate`).
 */
export type MomoConfig = {
  baseUrl: string
  targetEnv: string
  subscriptionKey: string
  apiUser: string
  apiKey: string
  callbackUrl: string | null
  currency: string
}

const env = (name: string) => process.env[name]?.trim() || ""

export function getMomoConfig(): MomoConfig | null {
  const config = {
    baseUrl: env("MOMO_BASE_URL").replace(/\/+$/, ""),
    targetEnv: env("MOMO_TARGET_ENV"),
    subscriptionKey: env("MOMO_SUBSCRIPTION_KEY"),
    apiUser: env("MOMO_API_USER"),
    apiKey: env("MOMO_API_KEY"),
    callbackUrl: env("MOMO_CALLBACK_URL") || null,
    currency: env("MOMO_CURRENCY") || "RWF",
  }
  const required = [config.baseUrl, config.targetEnv, config.subscriptionKey, config.apiUser, config.apiKey]
  return required.every(Boolean) ? config : null
}

/** Sandbox only when BOTH the host and the target say so; anything else is treated as production. */
export function isSandbox(config: MomoConfig): boolean {
  let host = "";
  try {
    host = new URL(config.baseUrl).hostname
  } catch {
    return false
  }
  return config.targetEnv === "sandbox" && host === "sandbox.momodeveloper.mtn.com"
}

/** MTN's documented international test MSISDN — the sandbox never prompts a real wallet. */
export const SANDBOX_PAYER = "46733123450"

const MTN_RWANDA = /^\+2507[89]\d{7}$/

/**
 * Payer number → E.164. Production takes MTN Rwanda only (078/079). In the sandbox the payer is
 * always the test MSISDN (MOMO_SANDBOX_PAYER, else MTN's default): a real broker's number is never sent.
 */
export function toMomoPayer(raw: string | null | undefined, sandbox: boolean): string | null {
  if (sandbox) {
    const t = env("MOMO_SANDBOX_PAYER").replace(/\D/g, "")
    return `+${/^\d{8,15}$/.test(t) ? t : SANDBOX_PAYER}`
  }
  const normalized = normalizePhone(raw, "RW")
  return normalized && MTN_RWANDA.test(normalized) ? normalized : null
}
