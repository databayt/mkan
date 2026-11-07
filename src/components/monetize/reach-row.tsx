import type { Locale } from "@/components/internationalization/config";
import { formatDate, formatNumber } from "@/lib/i18n/formatters";
import type { ReachDay, ReachView } from "@/lib/monetize/score-samples";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { INK, LINE, MUTED } from "./listing-ui";

/**
 * The TikTok page in four stat tiles (Abdout, 2026-11-07: "show how many people are following our
 * TikTok page and how many people are watching our posts"; "followers, watched, liked, interacted"):
 * followers, views (with posts and views a post), likes, comments and shares — the number now, the
 * week's gain, and one point a day. Single series, so no legend: the label names it; the trend is
 * in the muted hue with today in the accent, every point carries its value on hover, and the whole
 * series is in the image's name for a screen reader.
 */
type L = MonetizeLabels["score"]["reach"];
const ACCENT = "#E31C5F";
/** One slot a day for the last two weeks. */
const SLOTS = 14;

const compact = (n: number, locale: Locale) => formatNumber(n, locale, n >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });

/** Day-over-day gains of a cumulative series (views, posts): what each day added. */
function daily(days: ReachDay[], pick: (d: ReachDay) => number | null): { day: string; value: number }[] {
  const out: { day: string; value: number }[] = [];
  for (let i = 1; i < days.length; i++) {
    const a = pick(days[i - 1]!);
    const b = pick(days[i]!);
    if (a != null && b != null) out.push({ day: days[i]!.day, value: Math.max(0, b - a) });
  }
  return out;
}

const dayLabel = (day: string, locale: Locale) => formatDate(new Date(`${day}T12:00:00Z`), locale, { year: undefined, month: "short", day: "numeric" });

function Line({ points, label, locale }: { points: { day: string; value: number }[]; label: string; locale: Locale }) {
  if (points.length < 2) return null;
  const W = 240;
  const H = 32;
  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  // Fourteen day slots, today at the right edge: a young record reads as young, not stretched.
  const slot = (W - 8) / (SLOTS - 1);
  const x = (i: number) => W - 4 - (points.length - 1 - i) * slot;
  const y = (v: number) => (hi === lo ? H / 2 : H - 4 - ((v - lo) / (hi - lo)) * (H - 8));
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-8 w-full" role="img" aria-label={label}>
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-[#B0B0B0] dark:stroke-muted-foreground" />
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.value)} r={i === last ? 4 : 6} fill={i === last ? ACCENT : "transparent"}>
          <title>{`${dayLabel(p.day, locale)}: ${formatNumber(p.value, locale)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Bars({ points, label, locale }: { points: { day: string; value: number }[]; label: string; locale: Locale }) {
  if (points.length < 1) return null;
  const W = 240;
  const H = 32;
  const hi = Math.max(1, ...points.map((p) => p.value));
  const step = W / SLOTS;
  const bw = Math.max(2, step - 2);
  const offset = W - points.length * step;
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-8 w-full" role="img" aria-label={label}>
      {points.map((p, i) => {
        const h = p.value > 0 ? Math.max(2, (p.value / hi) * (H - 2)) : 0;
        return (
          <rect key={p.day} x={offset + i * step + 1} y={H - h} width={bw} height={h} rx={1.5} fill={i === last ? ACCENT : undefined} className={i === last ? undefined : "fill-[#B0B0B0] dark:fill-muted-foreground"}>
            <title>{`${dayLabel(p.day, locale)}: ${formatNumber(p.value, locale)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Tile({
  label,
  value,
  gain,
  sub,
  trend,
  locale,
  L,
  since,
}: {
  label: string;
  value: number | null;
  gain: number | null;
  sub?: string | null;
  trend: React.ReactNode;
  locale: Locale;
  L: L;
  since: string | null;
}) {
  const g = gain == null ? null : `${gain > 0 ? "+" : ""}${formatNumber(gain, locale)}`;
  return (
    <div className={cn("rounded-xl border bg-white p-4 dark:bg-background", LINE)}>
      <p className={cn("text-sm font-semibold", INK)}>{label}</p>
      <p className={cn("mt-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums", value == null ? MUTED : INK)}>{value == null ? L.none : compact(value, locale)}</p>
      <p className={cn("mt-1 text-xs tabular-nums", gain != null && gain > 0 ? "font-semibold text-[#008A05]" : MUTED)}>
        {g == null ? L.noTrend : since ? fill(L.since, { v: g, date: dayLabel(since, locale) }) : fill(L.week, { v: g })}
      </p>
      {sub && <p className={cn("text-xs tabular-nums", MUTED)}>{sub}</p>}
      {trend}
    </div>
  );
}

export function ReachRow({ reach, labels, locale }: { reach: ReachView; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.score.reach;
  const followers = reach.days.filter((d) => d.followers != null).map((d) => ({ day: d.day, value: d.followers! }));
  const views = daily(reach.days, (d) => d.views);
  const likes = daily(reach.days, (d) => d.likes);
  const talk = daily(reach.days, (d) => d.talk);
  const list = (pts: { day: string; value: number }[]) => pts.map((p) => `${dayLabel(p.day, locale)} ${formatNumber(p.value, locale)}`).join(", ");
  const postsSub =
    reach.posts != null
      ? fill(L.postsSub, { n: formatNumber(reach.posts, locale), v: reach.viewsPerPost != null ? formatNumber(Math.round(reach.viewsPerPost), locale) : L.none })
      : null;
  return (
    <div className="mt-6">
      <h3 className={cn("text-sm font-semibold", INK)}>{L.title}</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={L.followers}
          value={reach.followers}
          gain={reach.followersWeek}
          since={reach.since}
          locale={locale}
          L={L}
          trend={<Line points={followers} label={fill(L.trendFollowers, { list: list(followers) })} locale={locale} />}
        />
        <Tile
          label={L.views}
          value={reach.views}
          gain={reach.viewsWeek}
          since={reach.since}
          sub={postsSub}
          locale={locale}
          L={L}
          trend={<Bars points={views} label={fill(L.trendViews, { list: list(views) })} locale={locale} />}
        />
        <Tile
          label={L.likes}
          value={reach.likes}
          gain={reach.likesWeek}
          since={reach.since}
          locale={locale}
          L={L}
          trend={<Bars points={likes} label={fill(L.trendLikes, { list: list(likes) })} locale={locale} />}
        />
        <Tile
          label={L.talk}
          value={reach.talk}
          gain={reach.talkWeek}
          since={reach.since}
          locale={locale}
          L={L}
          trend={<Bars points={talk} label={fill(L.trendTalk, { list: list(talk) })} locale={locale} />}
        />
      </div>
    </div>
  );
}
