import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import './ElasticSlider.css';

interface ElasticSliderProps {
  label: string;
  min?: number;
  max: number;
  value: number;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onChange: (value: number) => void;
  onChangeEnd?: (value: number) => void;
}

export function ElasticSlider({
  label,
  min = 0,
  max,
  value,
  disabled = false,
  leftIcon,
  rightIcon,
  onChange,
  onChangeEnd,
}: ElasticSliderProps) {
  const hit = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, Math.round(next)));
  const update = (event: PointerEvent<HTMLDivElement>) => {
    const rect = hit.current?.getBoundingClientRect();
    if (!rect) return value;
    const next = clamp(
      min +
        Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) *
          (max - min),
    );
    onChange(next);
    return next;
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    const next =
      event.key === 'Home'
        ? min
        : event.key === 'End'
          ? max
          : delta
            ? clamp(value + delta)
            : null;
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    onChangeEnd?.(next);
  };
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div
      className={`elastic-slider ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
    >
      {leftIcon && <span className="elastic-slider-icon">{leftIcon}</span>}
      <div
        ref={hit}
        className="elastic-slider-hit"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        onKeyDown={keyDown}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setActive(true);
          update(event);
        }}
        onPointerMove={(event) => {
          if (active) update(event);
        }}
        onPointerUp={(event) => {
          if (!active) return;
          const next = update(event);
          setActive(false);
          onChangeEnd?.(next);
        }}
        onPointerCancel={() => setActive(false)}
      >
        <span className="elastic-slider-track">
          <span
            className="elastic-slider-fill"
            style={{ width: `${percent}%` }}
          />
          <span
            className="elastic-slider-thumb"
            style={{ left: `${percent}%` }}
          />
        </span>
      </div>
      {rightIcon && <span className="elastic-slider-icon">{rightIcon}</span>}
    </div>
  );
}
