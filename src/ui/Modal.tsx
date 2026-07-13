import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

type AccessibleName =
  | { label: string; titleId?: never }
  | { label?: never; titleId: string };

type ModalProps = AccessibleName & {
  children: ReactNode;
  dismissible?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose?: () => void;
  backdropClassName?: string;
  dialogClassName?: string;
};

type ModalEntry = {
  token: symbol;
  backdrop: HTMLElement;
  dialog: HTMLElement;
  trigger: HTMLElement | null;
  fallbackFocus: RefObject<HTMLElement | null>;
  lastFocused: HTMLElement | null;
};

type IsolationState = {
  appRoot: HTMLElement | null;
  hadInert: boolean;
  inertValue: string | null;
  overflow: string;
};

const modalStack: ModalEntry[] = [];
let isolationState: IsolationState | null = null;

function syncModalLayers() {
  const top = modalStack[modalStack.length - 1];
  for (const entry of modalStack) {
    const isTop = entry === top;
    entry.backdrop.toggleAttribute('inert', !isTop);
    if (isTop) entry.backdrop.removeAttribute('aria-hidden');
    else entry.backdrop.setAttribute('aria-hidden', 'true');
    if (isTop) entry.dialog.setAttribute('aria-modal', 'true');
    else entry.dialog.removeAttribute('aria-modal');
  }
}

function beginIsolation() {
  if (isolationState) return;
  const appRoot = document.getElementById('chessball-app');
  isolationState = {
    appRoot,
    hadInert: appRoot?.hasAttribute('inert') ?? false,
    inertValue: appRoot?.getAttribute('inert') ?? null,
    overflow: document.body.style.overflow,
  };
  appRoot?.setAttribute('inert', '');
  document.body.style.overflow = 'hidden';
}

function endIsolation() {
  if (!isolationState || modalStack.length) return;
  const { appRoot, hadInert, inertValue, overflow } = isolationState;
  document.body.style.overflow = overflow;
  if (appRoot) {
    if (hadInert) appRoot.setAttribute('inert', inertValue ?? '');
    else appRoot.removeAttribute('inert');
  }
  isolationState = null;
}

function isTabbable(element: HTMLElement, dialog: HTMLElement) {
  if (element.tabIndex < 0 || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if ('disabled' in element && element.disabled) return false;
  for (let current: HTMLElement | null = element; current && current !== dialog; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function focusable(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>('*')).filter((element) => isTabbable(element, dialog));
}

export function Modal({ children, titleId, label, dismissible = false, initialFocus, fallbackFocus, onClose, backdropClassName = '', dialogClassName = '' }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const tokenRef = useRef(Symbol('modal'));
  const triggerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;
    beginIsolation();
    const entry: ModalEntry = { token: tokenRef.current, backdrop, dialog, trigger: triggerRef.current, fallbackFocus, lastFocused: null };
    modalStack.push(entry);
    syncModalLayers();
    const initialTarget = initialFocus?.current;
    const focusTarget = initialTarget && dialog.contains(initialTarget) && isTabbable(initialTarget, dialog)
      ? initialTarget
      : focusable(dialog)[0] ?? dialog;
    focusTarget.focus();
    entry.lastFocused = focusTarget;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (modalStack[modalStack.length - 1]?.token === entry.token && target instanceof HTMLElement && dialog.contains(target)) {
        entry.lastFocused = target;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1]?.token !== entry.token) return;
      if (event.key === 'Escape' && dismissibleRef.current) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable(dialog);
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
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
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown);
      const index = modalStack.findIndex((item) => item.token === entry.token);
      const wasTopmost = index === modalStack.length - 1;
      if (index >= 0) modalStack.splice(index, 1);
      syncModalLayers();
      endIsolation();
      if (wasTopmost) {
        const exposed = modalStack[modalStack.length - 1];
        if (exposed) {
          const remembered = exposed.lastFocused;
          const target = remembered?.isConnected && exposed.dialog.contains(remembered) && (remembered === exposed.dialog || isTabbable(remembered, exposed.dialog))
            ? remembered
            : focusable(exposed.dialog)[0] ?? exposed.dialog;
          target.focus();
        } else if (entry.trigger?.isConnected && entry.trigger !== document.body) entry.trigger.focus();
        else entry.fallbackFocus.current?.focus();
      }
    };
  }, []);

  return createPortal(
    <div ref={backdropRef} className={`rules-backdrop ${backdropClassName}`.trim()}>
      <section ref={dialogRef} className={`rules-dialog ${dialogClassName}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={label} tabIndex={-1}>
        {children}
      </section>
    </div>,
    document.body,
  );
}
