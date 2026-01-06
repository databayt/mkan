import { ErrorCard } from "@/components/auth/error-card";

interface AuthErrorPageProps {
  searchParams?: Promise<{
    error?: string;
  }>;
}

const AuthErrorPage = async ({ searchParams }: AuthErrorPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <ErrorCard error={resolvedSearchParams?.error} />
  );
};

export default AuthErrorPage;
