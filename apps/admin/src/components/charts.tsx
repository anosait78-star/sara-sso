import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Lightweight charts (no chart library): horizontal bar lists and monthly columns. */

export function Kpi({ label, value, tone = 'navy', hint }: { label: string; value: ReactNode; tone?: 'navy' | 'green' | 'red' | 'amber' | 'brand'; hint?: ReactNode }) {
  const color = { navy: 'text-navy', green: 'text-success', red: 'text-danger', amber: 'text-[#b57a00]', brand: 'text-brand' }[tone];
  return (
    <div className="rounded-[14px] border border-line bg-white p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={cn('ltr mt-1 text-start font-latin text-xl font-bold', color)}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function BarList({ items, format = (n) => n.toLocaleString('en'), empty, color = 'bg-brand' }: {
  items: { label: ReactNode; value: number; sub?: ReactNode }[]; format?: (n: number) => string; empty: string; color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="px-4 py-6 text-center text-xs text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-3 p-4">
      {items.map((i, k) => (
        <li key={k}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-ink">{i.label}</span>
            <span className="ltr shrink-0 font-latin font-bold text-navy">{format(i.value)}{i.sub && <span className="ms-1 font-normal text-ink-3">{i.sub}</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', color)} style={{ width: `${(i.value / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function Columns({ items, format = (n) => n.toLocaleString('en'), series }: {
  items: { label: string; values: number[] }[]; format?: (n: number) => string; series: { name: string; color: string }[];
}) {
  const max = Math.max(1, ...items.flatMap((i) => i.values));
  return (
    <div className="p-4">
      <div className="flex h-44 items-end gap-2 sm:gap-4">
        {items.map((i) => (
          <div key={i.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-1">
              {i.values.map((v, k) => (
                <div key={k} className="group relative w-full max-w-8 rounded-t-md" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: series[k]?.color }}>
                  <span className="ltr absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-latin text-[10px] font-bold text-navy group-hover:block">{format(v)}</span>
                </div>
              ))}
            </div>
            <div className="ltr mt-1.5 truncate text-center font-latin text-[10px] text-ink-3">{i.label}</div>
          </div>
        ))}
      </div>
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs text-ink-2">
          {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}

/** "2026-09" -> "Sep" / "سبتمبر" */
export function monthLabel(ym: string, lang: 'ar' | 'en') {
  const [y, m] = ym.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { month: 'short' }).format(new Date(y!, m! - 1, 1));
}
