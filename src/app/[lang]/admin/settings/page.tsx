import { getDictionary } from "@/components/internationalization/dictionaries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.settings ?? "Settings"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.settingsDescription ?? "Platform-level flags and configuration."}
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{a.comingSoonTitle ?? "Coming soon"}</CardTitle>
          <CardDescription>
            {a.comingSoonDescription ??
              "Feature flags, email templates, and platform fees will live here."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {a.settingsPlaceholder ??
            "For now, manage platform state directly through the overview, users, homes, and transport tabs."}
        </CardContent>
      </Card>
    </div>
  );
}
