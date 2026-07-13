import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalProps = {
  children: ReactNode;
  titleId?: string;
  label?: string;
  dismissible?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose?: () => void;
  backdropClassName?: string;
  dialogClassName?: string;
};

export function Modal({ children, titleId, label, dismissible = false, initialFocus, fallbackFocus, onClose, backdropClassName = '', dialogClassName = '' }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);

  useEffect(() => {
    const appRoot = document.getElementById('chessball-app');
    const hadInert = appRoot?.hasAttribute('inert') ?? false;
    const inertValue = appRoot?.getAttribute('inert');
    const previousOverflow = document.body.style.overflow;
    appRoot?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    (initialFocus?.current ?? focusable()[0] ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeElement = document.activeElement;
      if (!items.includes(activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appRoot) {
        if (hadInert) appRoot.setAttribute('inert', inertValue ?? '');
        else appRoot.removeAttribute('inert');
      }
      const trigger = triggerRef.current;
      if (trigger?.isConnected && trigger !== document.body) trigger.focus();
      else fallbackFocus.current?.focus();
    };
  }, [dismissible, fallbackFocus, initialFocus, onClose]);

  return createPortal(
    <div className={`rules-backdrop ${backdropClassName}`.trim()}>
      <section ref={dialogRef} className={`rules-dialog ${dialogClassName}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} tabIndex={-1}>
        {children}
      </section>
    </div>,
    document.body,
  );
}
