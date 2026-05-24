"use client";

import { Button } from "@/components/ui/button";
import { useGetAuthUserQuery } from "@/state/api";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import React from "react";

const ContactWidget = ({ onOpenModal }: ContactWidgetProps) => {
  const dict = useDictionary();
  const t = dict?.property?.contactWidget;
  const { locale } = useLocale();
  const { data: authUser } = useGetAuthUserQuery();
  const router = useRouter();

  const handleButtonClick = () => {
    if (authUser) {
      onOpenModal();
    } else {
      router.push(`/${locale}/signin`);
    }
  };

  return (
    <div className="bg-white border border-primary-200 rounded-2xl p-7 h-fit min-w-[300px]">
      {/* Contact Property */}
      <div className="flex items-center gap-5 mb-4 border border-primary-200 p-4 rounded-xl">
        <div className="flex items-center p-4 bg-primary-900 rounded-full">
          <Phone className="text-primary-50" size={15} />
        </div>
        <div>
          <p>{t?.contactProperty ?? "Contact This Property"}</p>
          <div className="text-lg font-bold text-primary-800">
            (424) 340-5574
          </div>
        </div>
      </div>
      <Button
        className="w-full bg-primary-700 text-white hover:bg-primary-600"
        onClick={handleButtonClick}
      >
        {authUser
          ? (t?.submitApplication ?? "Submit Application")
          : (t?.signInToApply ?? "Sign In to Apply")}
      </Button>

      <hr className="my-4" />
      <div className="text-sm">
        <div className="text-primary-600 mb-1">{t?.languages ?? "Language: English, Bahasa."}</div>
        <div className="text-primary-600">
          {t?.appointmentHours ?? "Open by appointment on Monday - Sunday"}
        </div>
      </div>
    </div>
  );
};

export default ContactWidget;
