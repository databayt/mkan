import { NewVerificationForm } from "@/components/auth/verification/form";

interface NewVerificationPageProps {
  searchParams?: Promise<{
    token?: string;
  }>;
}

const NewVerificationPage = async ({ searchParams }: NewVerificationPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <NewVerificationForm token={resolvedSearchParams?.token} />
  );
};

export default NewVerificationPage;