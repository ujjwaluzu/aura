import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
export function DialogPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = ref.current;
    panel?.querySelector<HTMLElement>('button')?.focus();
    const key = (event: KeyboardEvent) => {
      if (!panel?.getClientRects().length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const elements = panel.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) close.current();
    });
    if (panel) observer.observe(panel);
    document.addEventListener('keydown', key);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', key);
      if (previous?.isConnected && previous.getClientRects().length)
        previous.focus();
      else
        document
          .querySelector<HTMLElement>(
            '.music-section-nav [aria-current="page"]',
          )
          ?.focus();
    };
  }, []);
  return (
    <div
      className="settings-dialog-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      ref={ref}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      {children}
    </div>
  );
}
