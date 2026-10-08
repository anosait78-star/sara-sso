import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui';
import { displayPhone } from '@/lib/crm';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface Hit { kind: 'customer' | 'lead'; id: string; number: string | null; title: string; subtitle: string | null }

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Results({ q, onPick }: { q: string; onPick: (h: Hit) => void }) {
  const { t } = useTranslation();
  const dq = useDebounced(q.trim(), 250);
  const res = useQuery({
    queryKey: ['global_search', dq],
    enabled: dq.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('global_search', { p_query: dq });
      if (error) throw error;
      return data as Hit[];
    },
  });
  if (dq.length < 2) return <div className="px-4 py-3 text-xs text-ink-3">{t('search.min')}</div>;
  if (!res.data) return <div className="px-4 py-3 text-xs text-ink-3">{t('common.loading')}</div>;
  if (!res.data.length) return <div className="px-4 py-3 text-xs text-ink-3">{t('search.noResults')}</div>;
  return (
    <div className="py-1">
      {(['customer', 'lead'] as const).map((kind) => {
        const items = res.data.filter((h) => h.kind === kind);
        if (!items.length) return null;
        return (
          <div key={kind}>
            <div className="px-4 pb-1 pt-2 text-[11px] font-bold text-ink-3">{kind === 'customer' ? t('search.customers') : t('search.leads')}</div>
            {items.map((h) => (
              <button key={h.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(h)} className="flex w-full items-center gap-3 px-4 py-2 text-start text-sm hover:bg-muted">
                <Badge tone={kind === 'customer' ? 'blue' : 'purple'} dot={false} className="h-5 text-[10px]"><span className="ltr">{h.number}</span></Badge>
                <span className="min-w-0 flex-1 truncate font-semibold">{h.title}</span>
                <span className="ltr shrink-0 text-xs text-ink-3">{displayPhone(h.subtitle)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function pick(h: Hit) {
    setQ('');
    setOpen(false);
    setMobileOpen(false);
    void navigate(h.kind === 'customer' ? { to: '/customers/$id', params: { id: h.id } } : { to: '/leads/$id', params: { id: h.id } });
  }

  return (
    <>
      <div className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-ink-3" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t('search.placeholder')}
          className="h-10 w-full rounded-[10px] border border-line bg-canvas ps-9 pe-14 text-sm outline-none focus:border-brand focus:bg-white"
        />
        <kbd className="font-latin pointer-events-none absolute inset-y-0 end-2 my-auto h-5 rounded border border-line bg-white px-1.5 text-[10px] leading-5 text-ink-3">Ctrl K</kbd>
        {open && q && (
          <div className="absolute inset-x-0 top-12 z-40 max-h-96 overflow-y-auto rounded-xl border border-line bg-white shadow-xl">
            <Results q={q} onPick={pick} />
          </div>
        )}
      </div>
      <button type="button" onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-[10px] border border-line text-ink-2 md:hidden" aria-label={t('search.placeholder')}>
        <Search className="size-[18px]" />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <Search className="size-5 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search.placeholder')} className="h-10 flex-1 text-base outline-none" />
            <button type="button" onClick={() => { setMobileOpen(false); setQ(''); }} className={cn('rounded-lg p-2 text-ink-2')} aria-label={t('common.close')}><X className="size-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto"><Results q={q} onPick={pick} /></div>
        </div>
      )}
    </>
  );
}
