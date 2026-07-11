// Stub component for unused row components
"use client";

import { useDictionary } from "@/components/internationalization/use-dictionary";

export default function SignOut() {
  const dict = useDictionary();
  return (
    <li className="hover:bg-slate-200 rounded-md p-2 cursor-pointer">
      {dict?.auth?.signOut ?? "Sign out"}
    </li>
  );
}
