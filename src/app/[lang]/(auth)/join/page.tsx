import { RegisterForm } from "@/components/auth/join/form";

interface RegisterPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <RegisterForm callbackUrl={resolvedSearchParams?.callbackUrl} />
  );
};

export default RegisterPage;