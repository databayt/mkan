"use client";

import SearchBar from "../template/search/help-search";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function HelpHeading() {
  const dict = useDictionary();
  const t = dict?.help?.heading;

  return (
    <div className="text-center py-10">
      <h2>{t?.greeting ?? "Hi About, how can we help?"}</h2>
      <SearchBar />
    </div>
  );
}
