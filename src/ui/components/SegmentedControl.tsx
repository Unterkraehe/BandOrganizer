import { useId } from 'react';
import styles from './SegmentedControl.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Single choice between a few options (radio group semantics). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset className={styles.group}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.option} data-checked={option.value === value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
