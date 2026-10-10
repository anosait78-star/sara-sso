import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronDown, Globe, KeyRound, LogOut, Menu, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationsBell } from '@/components/NotificationsBell';
import { Avatar, Button, Spinner } from '@/components/ui';
import { setLocale, type Locale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { visibleNav, type NavItem } from './nav';

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

/** Guards the whole admin area: signed in, active staff, password not temporary. */
export function AppShell() {
  const { t } = useTranslation();
  const { session, sessionLoading, staff, staffLoading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionLoading && !session) void navigate({ to: '/login' });
  }, [session, sessionLoading, navigate]);

  useEffect(() => {
    if (staff?.must_change_password) void navigate({ to: '/change-password' });
  }, [staff, navigate]);

  if (sessionLoading || (session && staffLoading)) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!session) return null;
  if (!staff) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm rounded-2xl border border-line bg-white p-6 text-center">
          <p className="text-sm text-ink">{t('errors.notStaff')}</p>
          <Button className="mt-4" variant="navy" onClick={() => void signOut()}>
            {t('auth.logout')}
          </Button>
        </div>
      </div>
    );
  }
  return <ShellLayout />;
}

function ShellLayout() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const groups = useMemo(() => visibleNav((p) => {
    const [m, a] = p.split('.');
    return can(m!, a!);
  }), [can]);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setOverlayOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const flat = groups.flatMap((g) => g.items);
  // PROJECT_PLAN §17: Home · Requests · Tasks · Customers · More (falls back to the next visible items)
  const preferred = ['dashboard', 'requests', 'tasks', 'customers'];
  const bottomItems = [...preferred.map((k) => flat.find((i) => i.key === k)).filter((i): i is NavItem => !!i), ...flat.filter((i) => !preferred.includes(i.key))].slice(0, 4);

  return (
    <div className="flex h-full">
      {/* Desktop ≥1280: full sidebar · Tablet 768–1279: icon rail */}
      <aside className="hidden shrink-0 flex-col bg-navy text-[#c7d4ea] md:flex md:w-[72px] xl:w-[264px]">
        <Sidebar groups={groups} pathname={pathname} compact />
      </aside>

      {/* Tablet: expanded overlay sidebar */}
      {overlayOpen && (
        <div className="fixed inset-0 z-40 hidden md:block xl:hidden">
          <div className="absolute inset-0 bg-[rgba(11,22,40,.45)]" onClick={() => setOverlayOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-[264px] flex-col bg-navy text-[#c7d4ea] shadow-2xl">
            <Sidebar groups={groups} pathname={pathname} />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setOverlayOpen(true)} />
        <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 md:px-6 md:pb-6 md:pt-5">
          <Outlet />
        </div>
      </main>

      {/* Mobile <768: bottom navigation + "more" sheet */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-start justify-around border-t border-line bg-white pt-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        {bottomItems.map((item) => (
          <BottomLink key={item.key} item={item} active={isActive(pathname, item.to)} label={t(`nav.${item.key}`)} />
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex w-16 flex-col items-center gap-1 text-[11px] font-semibold text-ink-3">
          <Menu className="size-[22px]" />
          {t('common.more')}
        </button>
      </nav>
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-canvas md:hidden">
          <div className="flex items-center gap-2 border-b border-line bg-white px-4 py-3">
            <span className="flex-1 text-lg font-bold text-navy">{t('nav.menu')}</span>
            <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-ink-2" aria-label={t('common.close')}>
              <X className="size-5" />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {groups.map((g) => (
              <div key={g.key ?? 'main'}>
                {g.key && <div className="mb-2 text-xs font-bold text-ink-3">{t(`nav.groups.${g.key}`)}</div>}
                <div className="grid grid-cols-4 gap-2">
                  {g.items.map((item) => (
                    <Link key={item.key} to={item.to} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-white px-1 py-3 text-center text-[11px] font-semibold text-ink">
                      <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand">
                        <item.icon className="size-[18px]" />
                      </span>
                      {t(`nav.${item.key}`)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ groups, pathname, compact }: { groups: ReturnType<typeof visibleNav>; pathname: string; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <div className={cn('m-3 flex items-center justify-center rounded-xl bg-white', compact ? 'h-12 xl:h-14' : 'h-14')}>
        <img src="/logo-mark.png" alt="SSO" className={cn('object-contain', compact ? 'h-7 xl:hidden' : 'hidden')} />
        <img src="/logo.png" alt="SSO · Sara Soliman" className={cn('h-11 object-contain', compact ? 'hidden xl:block' : 'block')} />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {groups.map((g) => (
          <div key={g.key ?? 'main'}>
            {g.key && (
              <div className={cn('px-3 pb-1 pt-3 text-[11px] font-semibold text-[#7f95bc]', compact && 'hidden xl:block')}>{t(`nav.groups.${g.key}`)}</div>
            )}
            {g.key && compact && <div className="mx-auto my-2 h-px w-8 bg-[#20406f] xl:hidden" />}
            {g.items.map((item) => {
              const active = isActive(pathname, item.to);
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  title={t(`nav.${item.key}`)}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors',
                    compact && 'justify-center px-0 xl:justify-start xl:px-3',
                    active ? 'bg-brand text-white' : 'hover:bg-navy-700 hover:text-white',
                  )}
                >
                  <item.icon className="size-[18px] shrink-0" />
                  <span className={cn(compact && 'hidden xl:inline', item.key === 'workflow' && 'font-latin')}>{t(`nav.${item.key}`)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

function BottomLink({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  return (
    <Link to={item.to} className={cn('flex w-16 flex-col items-center gap-1 text-center text-[11px] font-semibold leading-tight', active ? 'text-brand' : 'text-ink-3')}>
      <item.icon className="size-[22px]" />
      <span className="line-clamp-1">{label}</span>
    </Link>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t, i18n } = useTranslation();
  const { staff, signOut } = useAuth();
  const navigate = useNavigate();
  const nextLocale: Locale = i18n.language === 'ar' ? 'en' : 'ar';
  const roleName = i18n.language === 'en' ? staff?.role_name_en ?? staff?.role_name_ar : staff?.role_name_ar;

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white px-4 md:px-6">
      <button type="button" onClick={onMenu} className="hidden rounded-lg border border-line p-2 text-ink-2 md:block xl:hidden" aria-label={t('nav.menu')}>
        <Menu className="size-5" />
      </button>
      <img src="/logo-mark.png" alt="SSO" className="h-8 md:hidden" />
      <GlobalSearch />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        className="flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3 text-sm font-semibold text-ink-2 hover:bg-muted"
      >
        <Globe className="size-4" />
        <span className="hidden sm:inline">{t('topbar.language')}</span>
      </button>
      <NotificationsBell />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex items-center gap-2 rounded-[10px] p-1 outline-none hover:bg-muted">
          <Avatar name={staff?.full_name ?? ''} />
          <span className="hidden text-start leading-tight lg:block">
            <span className="block text-[13px] font-bold text-ink">{staff?.full_name}</span>
            <span className="block text-[11px] text-ink-2">{roleName}</span>
          </span>
          <ChevronDown className="hidden size-4 text-ink-3 lg:block" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-xl border border-line bg-white p-1 shadow-xl">
            <DropdownMenu.Item onSelect={() => void navigate({ to: '/account' })} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted">
              <UserRound className="size-4" /> {t('nav.account')}
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => void navigate({ to: '/change-password' })} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted">
              <KeyRound className="size-4" /> {t('account.changePassword')}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item onSelect={() => void signOut()} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-[#fff5f5]">
              <LogOut className="size-4" /> {t('auth.logout')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}

/** Page-level permission guard. */
export function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [m, a] = perm.split('.');
  if (!can(m!, a!)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <h2 className="text-lg font-bold text-navy">{t('forbidden.title')}</h2>
        <p className="mt-2 text-sm text-ink-2">{t('forbidden.body')}</p>
      </div>
    );
  }
  return <>{children}</>;
}
