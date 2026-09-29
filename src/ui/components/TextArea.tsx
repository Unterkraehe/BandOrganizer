import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import styles from './TextField.module.css';

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hideLabel?: boolean;
  error?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, hideLabel, error, id, className, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
      </label>
      <textarea ref={ref} id={inputId} className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')} aria-invalid={error ? true : undefined} {...rest} />
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
});
