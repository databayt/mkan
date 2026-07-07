"use client";

import Loading from "@/components/atom/loading";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function LoadingPage() {
  const dict = useDictionary();
  const t = dict?.transportHost?.loading;
  return <Loading variant="fullscreen" text={t?.text ?? "Loading..."} />;
}
