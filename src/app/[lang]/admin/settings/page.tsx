import { getDictionary } from "@/components/internationalization/dictionaries";
import { getPlatformSettings } from "@/lib/actions/admin-actions";
import AdminSettingsContent from "./content";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};
  const settings = await getPlatformSettings();

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">{a.settings ?? "Settings"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.settingsDescription ?? "Platform-level flags and configuration."}
        </p>
      </header>

      <AdminSettingsContent
        initial={{
          platformFeePct: settings.platformFeePct,
          defaultCancellationPolicy: settings.defaultCancellationPolicy,
          supportedCurrencies: settings.supportedCurrencies,
          payoutScheduleDays: settings.payoutScheduleDays,
          emailFrom: settings.emailFrom,
          supportEmail: settings.supportEmail,
        }}
        labels={{
          feeTitle: a.settingsFeeTitle ?? "Platform fee",
          feeDescription:
            a.settingsFeeDescription ??
            "Percentage of each booking the platform keeps. Used in payout calculations.",
          feeLabel: a.settingsFeeLabel ?? "Fee (%)",
          policyTitle: a.settingsPolicyTitle ?? "Default cancellation policy",
          policyDescription:
            a.settingsPolicyDescription ??
            "Applied to new listings whose host hasn't picked one explicitly.",
          policyLabel: a.settingsPolicyLabel ?? "Policy",
          currenciesTitle: a.settingsCurrenciesTitle ?? "Supported currencies",
          currenciesDescription:
            a.settingsCurrenciesDescription ??
            "Comma-separated ISO 4217 codes — empty means unrestricted.",
          currenciesLabel: a.settingsCurrenciesLabel ?? "Currencies",
          payoutsTitle: a.settingsPayoutsTitle ?? "Payout schedule",
          payoutsDescription:
            a.settingsPayoutsDescription ??
            "Days between booking completion and host payout.",
          payoutsLabel: a.settingsPayoutsLabel ?? "Days",
          emailTitle: a.settingsEmailTitle ?? "Email addresses",
          emailDescription:
            a.settingsEmailDescription ??
            "From: address on outbound transactional email and the visible support address.",
          emailFromLabel: a.settingsEmailFromLabel ?? "From address",
          supportEmailLabel: a.settingsSupportEmailLabel ?? "Support address",
          save: a.settingsSave ?? "Save",
          saving: a.settingsSaving ?? "Saving...",
          saved: a.settingsSaved ?? "Settings saved",
          error: a.error ?? "Something went wrong",
        }}
      />
    </div>
  );
}
