"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { i18n, type Locale } from "./config"

/**
 * Server action to set the user's locale preference.
 * Sets a secure `NEXT_LOCALE` cookie and redirects to the new locale URL so the
 * cookie is committed before the destination page renders.
 *
 * @param locale - The locale to switch to (en or ar)
 * @param pathname - The current pathname; its locale segment is swapped out
 */
export async function setLocale(locale: Locale, pathname: string) {
  if (!i18n.locales.includes(locale)) {
    throw new Error(`Invalid locale: ${locale}`)
  }

  const cookieStore = await cookies()
  cookieStore.set("NEXT_LOCALE", locale, {
    maxAge: 31536000, // 1 year
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })

  // Swap the leading /en or /ar segment for the target locale.
  const newPath = pathname.replace(/^\/(en|ar)(\/|$)/, `/${locale}$2`)
  redirect(newPath)
}
