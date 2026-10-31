import { useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';

export function GameMenu({ children, fallbackFocus, onClose }: {
  children: ReactNode;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Game menu" dismissible dismissOnBackdrop initialFocus={closeRef} fallbackFocus={fallbackFocus} onClose={onClose} backdropClassName="menu-backdrop" dialogClassName="menu-drawer rules-help-dialog">
      <header className="rules-header">
        <h2>Game menu</h2>
        <button ref={closeRef} className="rules-close" type="button" onClick={onClose} aria-label="Close menu"><X size={20} /></button>
      </header>
      <div className="rules-content menu-content">{children}</div>
    </Modal>
  );
}
