import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* ------------------------------ Spinner / estados ------------------------------ */
export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return <span className="row" role="status"><span className="spinner" /><span className="muted small">{label}</span></span>;
}
export function PageLoading() {
  return <div className="center-page"><Spinner /></div>;
}
export function EmptyState({ icon = 'info', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}
export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="alert critical" role="alert">
      <Icon name="alert" />
      <div><div className="alert-title">Não foi possível carregar</div><div className="small">{error}</div></div>
      {onRetry && <div className="alert-actions"><button className="btn btn-secondary btn-sm" onClick={onRetry}>Tentar novamente</button></div>}
    </div>
  );
}

/* ------------------------------ Page header ------------------------------ */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

/* ------------------------------ Badge ------------------------------ */
export function Badge({ tone = 'b-neutral', children, dot = true, title }: { tone?: string; children: ReactNode; dot?: boolean; title?: string }) {
  return <span className={`badge ${tone}${dot ? '' : ' no-dot'}`} title={title}>{children}</span>;
}
export function Missing({ text = 'NÃO INFORMADO' }: { text?: string }) {
  return <span className="badge b-missing">{text}</span>;
}

/* ------------------------------ Stat card ------------------------------ */
export function StatCard({ label, value, foot, accent, onClick, icon }: {
  label: string; value: ReactNode; foot?: ReactNode; accent?: string; onClick?: () => void; icon?: IconName;
}) {
  const style = accent ? ({ ['--stat-accent' as string]: accent } as React.CSSProperties) : undefined;
  const body = (
    <>
      <div className="row-between"><span className="stat-label">{label}</span>{icon && <Icon name={icon} size={18} className="muted" />}</div>
      <span className="stat-value">{value}</span>
      {foot && <span className="stat-foot">{foot}</span>}
    </>
  );
  return onClick
    ? <button type="button" className="stat" style={style} onClick={onClick}>{body}</button>
    : <div className="stat" style={style}>{body}</div>;
}

/* ------------------------------ Form fields ------------------------------ */
export function Field({ label, required, hint, error, children, htmlFor }: {
  label: ReactNode; required?: boolean; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}{required && <span className="req" aria-hidden>*</span>}</label>
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({ label, value, onChange, required, hint, error, type = 'text', placeholder, autoComplete, maxLength, inputMode, id, disabled, min, max }: {
  label: ReactNode; value: string | number | null | undefined; onChange: (v: string) => void; required?: boolean; hint?: ReactNode;
  error?: string | null; type?: string; placeholder?: string; autoComplete?: string; maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; id?: string; disabled?: boolean; min?: string; max?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={fid}>
      <input id={fid} className={`input${error ? ' invalid' : ''}`} type={type} value={value ?? ''} placeholder={placeholder}
        autoComplete={autoComplete} maxLength={maxLength} inputMode={inputMode} disabled={disabled} min={min} max={max}
        aria-invalid={!!error} required={required} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function TextArea({ label, value, onChange, hint, rows = 3, maxLength, placeholder, required, error }: {
  label: ReactNode; value: string | null | undefined; onChange: (v: string) => void; hint?: ReactNode; rows?: number;
  maxLength?: number; placeholder?: string; required?: boolean; error?: string | null;
}) {
  const fid = useId();
  return (
    <Field label={label} hint={hint} htmlFor={fid} required={required} error={error}>
      <textarea id={fid} className={`textarea${error ? ' invalid' : ''}`} rows={rows} maxLength={maxLength} placeholder={placeholder}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectInput({ label, value, onChange, options, placeholder = 'Selecione…', required, hint, error }: {
  label: ReactNode; value: string | null | undefined; onChange: (v: string) => void; options: { value: string; label: string }[];
  placeholder?: string; required?: boolean; hint?: ReactNode; error?: string | null;
}) {
  const fid = useId();
  return (
    <Field label={label} required={required} hint={hint} error={error} htmlFor={fid}>
      <select id={fid} className={`select${error ? ' invalid' : ''}`} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

/** Botões grandes de escolha única (mais fáceis que um select no celular). */
export function ChoiceChips<T extends string>({ label, value, onChange, options, required, hint, allowClear = true, chipClass, error }: {
  label: ReactNode; value: T | null | undefined; onChange: (v: T | null) => void; options: { value: T; label: string; title?: string }[];
  required?: boolean; hint?: ReactNode; allowClear?: boolean; chipClass?: (v: T) => string; error?: string | null;
}) {
  return (
    <div className="field" role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <span className="field-label">{label}{required && <span className="req" aria-hidden>*</span>}</span>
      <div className="chips">
        {options.map((o) => (
          <button key={o.value} type="button" title={o.title} className={`chip ${chipClass?.(o.value) ?? ''}`} aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value && allowClear ? null : o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */
export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn modal-close" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, onConfirm, onCancel, busy, children }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean; children?: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onCancel} footer={<>
      <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Voltar</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Aguarde…' : confirmLabel}</button>
    </>}>
      <div>{message}</div>
      {children}
    </Modal>
  );
}

/* ------------------------------ Toasts ------------------------------ */
type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} />
            <div style={{ flex: 1 }}>{t.text}</div>
            <button className="link-btn" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))} aria-label="Fechar aviso"><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ Tabs ------------------------------ */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" className="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}

export function AlertBox({ kind, title, children, actions, icon }: { kind: 'critical' | 'warning' | 'info' | 'success'; title?: ReactNode; children?: ReactNode; actions?: ReactNode; icon?: IconName }) {
  return (
    <div className={`alert ${kind}`} role={kind === 'critical' ? 'alert' : undefined}>
      <Icon name={icon ?? (kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'alert')} />
      <div style={{ minWidth: 0 }}>{title && <div className="alert-title">{title}</div>}{children && <div className="small">{children}</div>}</div>
      {actions && <div className="alert-actions">{actions}</div>}
    </div>
  );
}
