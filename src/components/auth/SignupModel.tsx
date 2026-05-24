// Stub component for unused row components
"use client";

import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function SignupModel() {
  const dict = useDictionary();
  const t = dict?.auth?.signup;

  return (
    <li className="hover:bg-slate-200 rounded-md p-2 cursor-pointer">
      {t?.signUp ?? "Sign up"}
    </li>
  );
}
