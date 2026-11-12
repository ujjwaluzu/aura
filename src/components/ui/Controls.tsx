import type { ReactNode } from 'react';

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="toggle"
    >
      <span />
    </button>
  );
}

export function ControlRow({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="control-row">
      <span className="control-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="control-copy">
        <span className="control-title">{title}</span>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
