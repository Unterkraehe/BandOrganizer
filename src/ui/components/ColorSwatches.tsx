import { Check } from 'lucide-react';
import { useId } from 'react';
import styles from './ColorSwatches.module.css';

interface Swatch {
  value: string;
  /** CSS color or var() */
  css: string;
  label: string;
  /** e.g. "schon vergeben" */
  note?: string;
}

interface ColorSwatchesProps {
  legend: string;
  swatches: Swatch[];
  value: string | null;
  onChange: (value: string) => void;
}

/** Color choice as a radio group; each swatch has a text label for screen readers (R-UI-05). */
export function ColorSwatches({ legend, swatches, value, onChange }: ColorSwatchesProps) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.grid}>
        {swatches.map((swatch) => {
          const checked = swatch.value === value;
          return (
            <label key={swatch.value} className={styles.swatch} title={swatch.note ? `${swatch.label} – ${swatch.note}` : swatch.label}>
              <input
                type="radio"
                name={name}
                value={swatch.value}
                checked={checked}
                onChange={() => onChange(swatch.value)}
                aria-label={swatch.note ? `${swatch.label}, ${swatch.note}` : swatch.label}
              />
              <span className={styles.dot} style={{ background: swatch.css }} data-note={swatch.note ? '' : undefined}>
                {checked && <Check size={18} strokeWidth={3} aria-hidden="true" />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
