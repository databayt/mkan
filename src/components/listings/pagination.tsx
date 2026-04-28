import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListingsPaginationProps {
  currentPage: number;
  totalPages: number;
  lang: string;
  baseParams: Record<string, string | string[] | undefined>;
  dict: {
    previous: string;
    next: string;
    pageOf: string;
  };
}

/**
 * Server-rendered pagination for /listings. Uses <Link> so crawlers index
 * paginated pages. Each control preserves the current filter params and
 * only overwrites `page`.
 */
export function ListingsPagination({
  currentPage,
  totalPages,
  lang,
  baseParams,
  dict,
}: ListingsPaginationProps) {
  if (totalPages <= 1) return null;

  const makeUrl = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) {
      if (v == null) continue;
      if (Array.isArray(v)) v.forEach((vv) => p.append(k, vv));
      else if (k !== "page") p.set(k, v);
    }
    p.set("page", String(page));
    return `/${lang}/listings?${p.toString()}`;
  };

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between mt-8 border-t pt-6"
    >
      {prevDisabled ? (
        <span className="inline-flex items-center text-sm text-muted-foreground">
          <ChevronLeft className="w-4 h-4 me-1 rtl:rotate-180" />
          {dict.previous}
        </span>
      ) : (
        <Link
          href={makeUrl(currentPage - 1)}
          className="inline-flex items-center text-sm hover:underline"
        >
          <ChevronLeft className="w-4 h-4 me-1 rtl:rotate-180" />
          {dict.previous}
        </Link>
      )}

      <span className="text-sm text-muted-foreground">
        {dict.pageOf.replace("{current}", String(currentPage)).replace("{total}", String(totalPages))}
      </span>

      {nextDisabled ? (
        <span className={cn("inline-flex items-center text-sm text-muted-foreground")}>
          {dict.next}
          <ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
        </span>
      ) : (
        <Link
          href={makeUrl(currentPage + 1)}
          className="inline-flex items-center text-sm hover:underline"
        >
          {dict.next}
          <ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
        </Link>
      )}
    </nav>
  );
}
