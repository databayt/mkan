import "server-only";
import { cookies } from "next/headers";
import { i18n } from "@/components/internationalization/config";
import type { Lang } from "./types";

/**
 * Ambient viewer locale for server actions that don't receive `lang` from a
 * route param (e.g. client-triggered re-queries). Reads the NEXT_LOCALE cookie
 * that proxy.ts sets; defaults to "ar" (the app default). Server pages should
 * prefer passing `params.lang` explicitly — it's reliable on first render,
 * before the cookie is written.
 */
export async function getDisplayLang(): Promise<Lang> {
  try {
    const c = await cookies();
    const v = c.get("NEXT_LOCALE")?.value;
    return (i18n.locales as readonly string[]).includes(v ?? "") ? (v as Lang) : "ar";
  } catch {
    return "ar";
  }
}
