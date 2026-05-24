'use client';
import { TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";

import { CardWrapper } from "@/components/auth/card-wrapper";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export const ErrorCard = () => {
  const params = useParams();
  const lang = (params?.lang as string) ?? "ar";
  const dict = useDictionary();
  const t = dict?.auth?.authError;

  return (
    <CardWrapper
      headerLabel={t?.headerLabel ?? "Oops! Something went wrong!"}
      backButtonHref={`/${lang}/login`}
      backButtonLabel={dict?.auth?.backToLogin ?? "Back to login"}
    >
      <div className="w-full flex justify-center items-center">
      <TriangleAlert className="text-destructive" />
      </div>
    </CardWrapper>
  );
};
