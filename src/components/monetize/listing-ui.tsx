import { cn } from "@/lib/utils";

/**
 * The listing detail page's idiom (src/app/[lang]/listings/[id]), in one place so
 * /monetize reads like a listing: #222 ink, #6A6A6A muted, #DDD hairlines, 22px
 * section titles, sections split by a bottom border, the Reserve card's gradient.
 * Every heading and paragraph carries its own size and colour: styles/typography.css
 * gives bare h2/h3/p/ol large sizes, muted ink and list margins.
 */
export const INK = "text-[#222222] dark:text-foreground";
export const MUTED = "text-[#6A6A6A] dark:text-muted-foreground";
export const LINE = "border-[#DDDDDD] dark:border-border";
export const GRADIENT = "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)";

export function Section({ id, title, aside, children, className }: { id?: string; title?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-28 border-b py-8", LINE, className)}>
      {(title || aside) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {title && <H2>{title}</H2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function H2({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[22px] font-semibold leading-[26px] tracking-[-0.44px]", INK, className)}>{children}</h2>;
}

export function Text({ children, className, muted }: { children: React.ReactNode; className?: string; muted?: boolean }) {
  return <p className={cn("text-base leading-6", muted ? MUTED : INK, className)}>{children}</p>;
}

/** The three bordered cards under a listing's title row. */
export function FeatureCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className={cn("flex flex-col justify-between gap-6 rounded-xl border p-4", LINE)}>
      <p className={cn("text-sm font-semibold leading-tight", INK)}>{label}</p>
      <div>
        <p className={cn("text-[22px] font-semibold leading-7 tabular-nums", tone === "neg" ? "text-[#C13515]" : tone === "pos" ? "text-[#008A05]" : INK)}>{value}</p>
        {sub && <p className={cn("mt-1 text-[13px] leading-4", MUTED)}>{sub}</p>}
      </div>
    </div>
  );
}

/** One row of a listing's highlights: icon, bold title, muted line. */
export function Highlight({ icon: Icon, title, sub, children }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <Icon className={cn("mt-0.5 size-6 shrink-0", INK)} strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <div className={cn("text-base font-medium leading-5", INK)}>{title}</div>
        {sub && <p className={cn("mt-1 text-sm leading-5", MUTED)}>{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function GradientLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} style={{ background: GRADIENT }} className={cn("flex h-12 w-full items-center justify-center rounded-[12px] text-base font-semibold text-white hover:opacity-95", className)}>
      {children}
    </a>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-[#F7F7F7] px-2.5 py-0.5 text-xs font-medium dark:bg-muted", INK, className)}>{children}</span>;
}

/** `code` spans inside a dictionary string render as code: the "do this" lines carry commands. */
export function RichText({ t }: { t: string }) {
  return (
    <>
      {t.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} dir="ltr" className="rounded-md bg-[#F7F7F7] px-1.5 py-0.5 font-mono text-[13px] dark:bg-muted">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
