import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BAND_COLOR_SUGGESTIONS, deriveBandTheme } from '@/core/color/bandTheme';
import { parseHex, toHex } from '@/core/color/color';
import { ColorSwatches } from './ColorSwatches';
import { TextField } from './TextField';
import styles from './BandColorPicker.module.css';

interface BandColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  hint?: string;
}

/** Band color: 12 suggestions + custom hex, with a live preview (design system §8). */
export function BandColorPicker({ value, onChange, hint }: BandColorPickerProps) {
  const { t } = useTranslation('band');
  const isSuggestion = (BAND_COLOR_SUGGESTIONS as readonly string[]).includes(value);
  const [custom, setCustom] = useState(isSuggestion ? '' : value);
  const [customError, setCustomError] = useState(false);
  const theme = deriveBandTheme(value);

  const onCustomChange = (text: string) => {
    setCustom(text);
    const rgb = parseHex(text);
    setCustomError(Boolean(text) && !rgb);
    if (rgb) onChange(toHex(rgb));
  };

  return (
    <div className={styles.picker}>
      <ColorSwatches
        legend={t('setup.color')}
        swatches={BAND_COLOR_SUGGESTIONS.map((hex) => ({ value: hex, css: hex, label: t(`color.names.${hex}`) }))}
        value={isSuggestion ? value : null}
        onChange={(hex) => {
          setCustom('');
          setCustomError(false);
          onChange(hex);
        }}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
      <TextField
        label={t('color.custom')}
        placeholder={t('color.customPlaceholder')}
        value={custom}
        onChange={(event) => onCustomChange(event.target.value)}
        error={customError ? t('color.invalid') : undefined}
        spellCheck={false}
        autoCapitalize="off"
        className={styles.custom}
      />
      <div className={styles.preview} aria-label={t('color.preview')}>
        <span className={styles.sample} style={{ background: theme.light.accent, color: theme.light.onAccent }}>
          {t('color.preview')}
        </span>
        <span className={styles.sample} style={{ background: theme.dark.accent, color: theme.dark.onAccent }}>
          {t('color.preview')}
        </span>
        {theme.adjusted && <span className={styles.hint}>{t('color.adjusted')}</span>}
      </div>
    </div>
  );
}
