// Stub component for unused row components
"use client";

import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function LoginModel() {
  const dict = useDictionary();
  const t = dict?.auth?.loginModel;

  return (
    <li className="hover:bg-slate-200 rounded-md p-2 cursor-pointer">
      {t?.login ?? "Login"}
    </li>
  );
}
