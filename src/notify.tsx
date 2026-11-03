import { useEffect, useState } from 'react';
import { Check, Close } from './icons';

export type ToastKind = 'ok' | 'warn' | 'busy';

/** Work out what a message is about so it can be shown the right way. */
export const kindOf = (m: string): ToastKind =>
  /…$|\.\.\.$/.test(m) ? 'busy' : /could not|couldn't|failed|nothing to|needs at least|add a frame first|not available|error/i.test(m) ? 'warn' : 'ok';

const Warn = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /></svg>;

/** Big, hard-to-miss message at the bottom of the screen. Tap to dismiss. */
export function Toast({ text, kind, onDismiss }: { text: string; kind: ToastKind; onDismiss: () => void }) {
  return (
    <button className={'toast ' + kind} role={kind === 'warn' ? 'alert' : 'status'} onClick={onDismiss}>
      <span className="toast-ic" aria-hidden="true">{kind === 'ok' ? <Check /> : kind === 'warn' ? <Warn /> : <span className="spin" />}</span>
      <span className="toast-tx">{text}</span>
    </button>
  );
}

/** A result shown inside a sheet. */
export function Banner({ text, kind = 'ok' }: { text: string; kind?: ToastKind }) {
  return (
    <div className={'banner ' + kind} role={kind === 'warn' ? 'alert' : 'status'}>
      <span className="toast-ic" aria-hidden="true">{kind === 'ok' ? <Check /> : kind === 'warn' ? <Warn /> : <span className="spin" />}</span>
      <span className="toast-tx">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------- confirm dialog (replaces the plain browser one)
interface Ask { title: string; body?: string; ok: string; danger?: boolean; resolve: (v: boolean) => void }
let push: ((a: Ask) => void) | null = null;

export function askConfirm(o: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!push) { resolve(confirm(o.title)); return; }
    push({ title: o.title, body: o.body, ok: o.ok ?? 'OK', danger: o.danger, resolve });
  });
}

export function ConfirmHost() {
  const [a, setA] = useState<Ask | null>(null);
  useEffect(() => { push = setA; return () => { push = null; }; }, []);
  if (!a) return null;
  const done = (v: boolean) => { a.resolve(v); setA(null); };
  return (
    <div className="dlg-back" onClick={() => done(false)}>
      <div className="dlg" role="alertdialog" aria-label={a.title} onClick={(e) => e.stopPropagation()}>
        <b>{a.title}</b>
        {a.body && <p className="muted">{a.body}</p>}
        <div className="dlg-act">
          <button className="btn" onClick={() => done(false)}><Close /> Cancel</button>
          <button className={'btn ' + (a.danger ? 'danger-solid' : 'primary')} autoFocus onClick={() => done(true)}>{a.ok}</button>
        </div>
      </div>
    </div>
  );
}
