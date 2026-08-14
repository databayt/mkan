import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/i18n/formatters";
import { cityLabel } from "@/components/travel/city-names";
import type { ListingPerformance } from "@/lib/actions/analytics-actions";
import type { AnalyticsLabels, SectionProps } from "./types";

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardHeader>
      {/* Wide tables scroll inside their own card rather than pushing the page
          sideways on a phone. */}
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>;
}

function ListingTable({
  rows,
  labels,
  locale,
  lang,
}: {
  rows: ListingPerformance[];
  labels: AnalyticsLabels;
  locale: "en" | "ar";
  lang: string;
}) {
  if (rows.length === 0) return <Empty label={labels.noData ?? ""} />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.colListing}</TableHead>
          <TableHead>{labels.colCity}</TableHead>
          <TableHead className="text-end">{labels.colViews}</TableHead>
          <TableHead className="text-end">{labels.colInquiries}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.listingId}>
            <TableCell className="max-w-[22rem]">
              <Link
                href={`/${lang}/admin/homes/${r.listingId}`}
                className="line-clamp-1 underline-offset-4 hover:underline"
              >
                {r.title?.trim() || labels.untitled}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {r.city ? cityLabel(r.city, locale) : "—"}
            </TableCell>
            <TableCell className="text-end tabular-nums">{formatNumber(r.views, locale)}</TableCell>
            <TableCell className="text-end tabular-nums">
              {formatNumber(r.inquiries, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Breakdowns({
  data,
  labels,
  locale,
  lang,
  typeLabels,
}: SectionProps & { lang: string; typeLabels: Record<string, string> }) {
  const num = (v: number) => formatNumber(v, locale);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title={labels.areaTitle ?? ""} note={labels.areaNote}>
        {data.areas.length === 0 ? (
          <Empty label={labels.noData ?? ""} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colArea}</TableHead>
                <TableHead className="text-end">{labels.colListings}</TableHead>
                <TableHead className="text-end">{labels.colViews}</TableHead>
                <TableHead className="text-end">{labels.colInquiries}</TableHead>
                <TableHead className="text-end">{labels.colRentals}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.areas.map((a) => (
                <TableRow key={a.area}>
                  <TableCell className="font-medium">{cityLabel(a.area, locale)}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(a.listings)}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(a.views)}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(a.inquiries)}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(a.rentals)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title={labels.typeTitle ?? ""}>
        {data.supply.byPropertyType.length === 0 ? (
          <Empty label={labels.noData ?? ""} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colType}</TableHead>
                <TableHead className="text-end">{labels.colCount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.supply.byPropertyType.map((t) => (
                <TableRow key={t.type}>
                  <TableCell className="font-medium">
                    {typeLabels[t.type] ?? labels.unknownType ?? t.type}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{num(t.count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title={labels.topListingsTitle ?? ""}>
        <ListingTable rows={data.topListings} labels={labels} locale={locale} lang={lang} />
      </Panel>

      <Panel title={labels.attentionTitle ?? ""} note={labels.attentionNote}>
        <ListingTable
          rows={data.zeroInquiryListings}
          labels={labels}
          locale={locale}
          lang={lang}
        />
      </Panel>
    </div>
  );
}
