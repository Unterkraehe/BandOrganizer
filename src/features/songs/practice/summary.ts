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

/** Why the current track doesn't play – shown in the mini player and the player, never silent (R-UX-10). */
export function playbackProblem(state: Pick<PlayerState, 'error'>, t: TFunction): string | null {
  if (state.error === 'load') return t('songs:player.loadError');
  if (state.error === 'decode') return t('songs:player.decodeError');
  if (state.error === 'blocked') return t('songs:player.blocked');
  return null;
}
