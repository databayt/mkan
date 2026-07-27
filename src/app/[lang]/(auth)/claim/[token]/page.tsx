import { ClaimContent } from "@/components/claim/content";
import type { Lang } from "@/components/translation/types";

interface ClaimPageProps {
  params: Promise<{ lang: string; token: string }>;
}

const ClaimPage = async ({ params }: ClaimPageProps) => {
  const { lang, token } = await params;
  return <ClaimContent token={token} lang={(lang === "en" ? "en" : "ar") as Lang} />;
};

export default ClaimPage;
