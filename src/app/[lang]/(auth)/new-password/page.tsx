import { NewPasswordForm } from "@/components/auth/password/form";

interface NewPasswordPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

const NewPasswordPage = async ({ searchParams }: NewPasswordPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <NewPasswordForm token={resolvedSearchParams?.token} />
  );
};

export default NewPasswordPage;