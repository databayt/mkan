import { LoginForm } from "@/components/auth/login/form";

interface LoginPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

const LoginPage = async ({ searchParams }: LoginPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <LoginForm
      callbackUrl={resolvedSearchParams?.callbackUrl}
      error={resolvedSearchParams?.error}
    />
  );
};

export default LoginPage;