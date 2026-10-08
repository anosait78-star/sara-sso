import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, X } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn, initials } from '@/lib/utils';

// ---------- Button ----------
type Variant = 'primary' | 'navy' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white border-brand hover:bg-[#004cc9]',
  navy: 'bg-navy text-white border-navy hover:bg-navy-700',
  secondary: 'bg-white text-ink border-line hover:bg-muted',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-muted',
  danger: 'bg-white text-danger border-[#f3c5c5] hover:bg-[#fff5f5]',
  success: 'bg-[#e7f6ee] text-success border-[#bfe6cf] hover:bg-[#dcf2e6]',
};
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }
>(({ className, variant = 'secondary', size = 'md', loading, disabled, children, ...props }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
      size === 'sm' && 'h-8 px-3 text-xs',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-12 px-5 text-[15px]',
      variants[variant],
      className,
    )}
    {...props}
  >
    {loading && <Loader2 className="size-4 animate-spin" />}
    {children}
  </button>
));
Button.displayName = 'Button';

// ---------- Inputs ----------
const fieldBase =
  'w-full rounded-[10px] border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:ring-3 focus:ring-brand-50 outline-none disabled:bg-muted';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, 'h-11 pe-8', className)} {...props}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-brand' : 'bg-[#cbd5e3]')}
    >
      <span className={cn('absolute top-1 size-4 rounded-full bg-white shadow transition-all', checked ? 'start-5' : 'start-1')} />
    </button>
  );
}

// ---------- Display ----------
type Tone = 'blue' | 'sky' | 'green' | 'amber' | 'red' | 'gray' | 'navy' | 'purple';
const tones: Record<Tone, string> = {
  blue: 'bg-brand-50 text-brand',
  sky: 'bg-[#e3f3fe] text-[#0a7cc7]',
  green: 'bg-[#e5f6ec] text-success',
  amber: 'bg-[#fdf3dc] text-[#b57a00]',
  red: 'bg-[#fce8e8] text-danger',
  gray: 'bg-[#eef1f5] text-ink-2',
  navy: 'bg-navy text-white',
  purple: 'bg-[#efeafe] text-[#6b45d9]',
};
export function Badge({ tone = 'gray', dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>{children}</div>;
}

export function CardHeader({ title, icon, actions }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold text-navy">
      {icon}
      <span className="flex-1">{title}</span>
      {actions}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-navy',
        size === 'sm' && 'size-7 text-[11px]',
        size === 'md' && 'size-9 text-xs',
        size === 'lg' && 'size-14 text-lg',
      )}
    >
      {initials(name) || '؟'}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-brand', className)} />;
}

export function PageHeader({ title, crumb, actions }: { title: string; crumb?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        {crumb && <div className="text-xs text-ink-3">{crumb}</div>}
        <h1 className="text-xl font-bold text-navy md:text-2xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center text-ink-3">
      {icon}
      <span className="text-sm">{title}</span>
    </div>
  );
}

// ---------- Drawer (desktop: side panel · mobile: full screen) ----------
export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(11,22,40,.45)]" />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-white shadow-2xl outline-none',
            width === 'md' ? 'md:w-[460px]' : 'md:w-[min(720px,92vw)]',
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Dialog.Title className="flex-1 text-base font-bold text-navy">{title}</Dialog.Title>
            <Dialog.Close className="rounded-lg p-1.5 text-ink-3 hover:bg-muted" aria-label="close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{typeof title === 'string' ? title : ''}</Dialog.Description>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-line bg-white px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------- Confirm dialog ----------
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  loading,
  danger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(11,22,40,.45)]" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 w-[min(420px,92vw)] -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl outline-none ltr:-translate-x-1/2 rtl:translate-x-1/2">
          <Dialog.Title className="text-base font-bold text-navy">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <div className="mt-5 flex gap-2">
            <Button variant={danger ? 'danger' : 'primary'} className={danger ? 'bg-danger text-white border-danger hover:bg-[#c23232]' : ''} loading={loading} onClick={onConfirm}>
              {confirmLabel}
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
