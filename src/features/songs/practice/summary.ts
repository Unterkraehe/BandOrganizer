import type { TFunction } from 'i18next';
import type { PlayerState } from '@/core/audio/engine';

/** "80 % · −2 HT · Schleife" – shown whenever practice settings are active (F4 §4.2). */
export function practiceSummary(state: Pick<PlayerState, 'tempo' | 'semitones' | 'loop'>, t: TFunction): string | null {
  const parts: string[] = [];
  if (state.tempo !== 1) parts.push(t('songs:practice.tempoValue', { value: Math.round(state.tempo * 100) }));
  if (state.semitones !== 0) parts.push(t('songs:practice.semitonesShort', { value: `${state.semitones > 0 ? '+' : '−'}${Math.abs(state.semitones)}` }));
  if (state.loop?.enabled) parts.push(t('songs:practice.loopShort'));
  return parts.length ? parts.join(' · ') : null;
}
