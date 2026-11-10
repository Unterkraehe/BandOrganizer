import { Minus, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SEMITONES_MAX, TEMPO_MAX, TEMPO_MIN, type AudioEngine, type Loop, type PlayerState } from '@/core/audio/engine';
import { formatDuration } from '@/core/i18n/format';
import { Button, IconButton } from '@/ui';
import styles from './Practice.module.css';

/** shortest loop the engine keeps (engine.ts MIN_LOOP) */
const MIN_LOOP = 1;

/**
 * Tempo, pitch (independent) and A–B loop (F4 §4.3, F9) – redone in v1.1.0:
 * - big − / + with the value between them, one "Zurücksetzen" (tempo and pitch back to the original);
 * - the loop is set the way you hear it: "A setzen" marks the start and the song KEEPS PLAYING,
 *   "B setzen" at the end starts the loop. Before, A placed B eight seconds later at once, so the song
 *   jumped back before the real end was reached. −1 s / +1 s move each end afterwards.
 * `disabled`: this song isn't the one playing – the controls keep their place (R-UI-11) but can't act.
 */
export function PracticeControls({ engine, state, disabled = false }: { engine: AudioEngine; state: PlayerState; disabled?: boolean }) {
  const { t } = useTranslation('songs');
  const tempoPercent = Math.round(state.tempo * 100);
  const setTempo = (percent: number) => engine.setEffects({ tempo: Math.min(TEMPO_MAX * 100, Math.max(TEMPO_MIN * 100, percent)) / 100 });
  const setPitch = (semitones: number) => engine.setEffects({ semitones: Math.max(-SEMITONES_MAX, Math.min(SEMITONES_MAX, semitones)) });
  const loop = disabled ? null : state.loop;
  const marked = disabled ? null : state.loopStart;
  const start = loop?.start ?? marked;
  const ready = !disabled && Boolean(state.track) && state.duration > 0;
  const pitchLabel =
    state.semitones === 0 || disabled ? t('practice.pitchZero') : `${state.semitones > 0 ? '+' : '−'}${t('practice.pitchValue', { count: Math.abs(state.semitones) })}`;

  const setA = () => {
    const position = state.position;
    // inside an existing loop: only its start moves; otherwise a new loop begins here and waits for B
    if (loop && position < loop.end - MIN_LOOP) engine.setLoop({ ...loop, start: position, enabled: true });
    else engine.markLoopStart(position);
  };
  const canSetB = ready && start !== null && state.position >= start + MIN_LOOP;
  const setB = () => {
    if (start === null || !canSetB) return;
    engine.setLoop({ start, end: state.position, enabled: true });
  };
  /** Move one end by a second and play from where the change can be heard. */
  const nudge = (edge: 'start' | 'end', delta: number) => {
    if (!loop) return;
    const next: Loop =
      edge === 'start'
        ? { ...loop, start: Math.min(loop.end - MIN_LOOP, Math.max(0, loop.start + delta)) }
        : { ...loop, end: Math.max(loop.start + MIN_LOOP, Math.min(state.duration || loop.end + delta, loop.end + delta)) };
    engine.setLoop(next);
    engine.seek(edge === 'start' ? next.start : Math.max(next.start, next.end - 2));
  };
  const hint = disabled ? t('player.playToPractice') : loop ? t('practice.loopHintSet') : marked !== null ? t('practice.loopHintEnd') : t('practice.loopHintStart');
  const time = (seconds: number | null | undefined) => (typeof seconds === 'number' ? formatDuration(seconds) : '–:––');

  const edge = (mark: 'A' | 'B', seconds: number | null | undefined, which: 'start' | 'end') => (
    <div className={styles.edge}>
      <span className={styles.mark} data-set={typeof seconds === 'number' || undefined}>
        {mark}
      </span>
      <IconButton label={t('practice.nudgeBack', { mark })} icon={<Minus size={18} />} onClick={() => nudge(which, -1)} disabled={!loop} />
      <span className={styles.time}>{time(seconds)}</span>
      <IconButton label={t('practice.nudgeForward', { mark })} icon={<Plus size={18} />} onClick={() => nudge(which, 1)} disabled={!loop} />
      {which === 'start' ? (
        <Button className={styles.setButton} variant={start === null ? 'primary' : 'secondary'} onClick={setA} disabled={!ready}>
          {t('practice.setA')}
        </Button>
      ) : (
        <Button className={styles.setButton} variant={marked !== null ? 'primary' : 'secondary'} onClick={setB} disabled={!canSetB}>
          {t('practice.setB')}
        </Button>
      )}
    </div>
  );

  return (
    <div className={styles.controls}>
      <section className={styles.card} aria-label={t('practice.tempo')}>
        <div className={styles.stepper}>
          <span className={styles.label}>{t('practice.tempo')}</span>
          <IconButton className={styles.step} label={t('practice.slower')} icon={<Minus size={22} />} onClick={() => setTempo(Math.round((tempoPercent - 5) / 5) * 5)} disabled={disabled || tempoPercent <= TEMPO_MIN * 100} />
          <span className={styles.value} data-active={(!disabled && tempoPercent !== 100) || undefined} aria-live="polite">
            {t('practice.tempoValue', { value: disabled ? 100 : tempoPercent })}
          </span>
          <IconButton className={styles.step} label={t('practice.faster')} icon={<Plus size={22} />} onClick={() => setTempo(Math.round((tempoPercent + 5) / 5) * 5)} disabled={disabled || tempoPercent >= TEMPO_MAX * 100} />
        </div>
        <div className={styles.sliderRow}>
        <input
          type="range"
          className={styles.slider}
          min={TEMPO_MIN * 100}
          max={TEMPO_MAX * 100}
          step={1}
          value={disabled ? 100 : tempoPercent}
          disabled={disabled}
          onChange={(e) => setTempo(Number(e.target.value))}
          aria-label={t('practice.tempo')}
          aria-valuetext={t('practice.tempoValue', { value: tempoPercent })}
        />
          {/* always present (disabled at the original): back to original tempo and pitch; the loop has its own delete */}
          <IconButton label={t('practice.reset')} icon={<RotateCcw size={18} />} disabled={disabled || (state.tempo === 1 && state.semitones === 0)} onClick={() => engine.setEffects({ tempo: 1, semitones: 0 })} />
        </div>
        <div className={styles.stepper}>
          <span className={styles.label}>{t('practice.pitch')}</span>
          <IconButton className={styles.step} label={t('practice.lower')} icon={<Minus size={22} />} onClick={() => setPitch(state.semitones - 1)} disabled={disabled || state.semitones <= -SEMITONES_MAX} />
          <span className={styles.value} data-active={(!disabled && state.semitones !== 0) || undefined} aria-live="polite">
            {pitchLabel}
          </span>
          <IconButton className={styles.step} label={t('practice.higher')} icon={<Plus size={22} />} onClick={() => setPitch(state.semitones + 1)} disabled={disabled || state.semitones >= SEMITONES_MAX} />
        </div>
      </section>

      <section className={styles.card} aria-label={t('practice.loop')}>
        <div className={styles.cardHead}>
          <span className={styles.label}>{t('practice.loop')}</span>
          <Button
            variant={loop?.enabled ? 'primary' : 'secondary'}
            icon={<Repeat size={18} />}
            aria-pressed={Boolean(loop?.enabled)}
            onClick={() => loop && engine.setLoop({ ...loop, enabled: !loop.enabled })}
            disabled={!loop}
          >
            {loop?.enabled ? t('practice.loopOn') : t('practice.loopOff')}
          </Button>
          <IconButton label={t('practice.clearLoop')} icon={<Trash2 size={18} />} onClick={() => engine.setLoop(null)} disabled={!loop && marked === null} />
        </div>
        {edge('A', start, 'start')}
        {edge('B', loop?.end, 'end')}
        {/* always two lines of space: nothing below moves when the hint changes (R-UI-11) */}
        <p className={styles.hint} aria-live="polite">
          {hint}
        </p>
      </section>

      {state.error === 'effects' && !disabled && <p className={styles.warning}>{t('practice.effectsUnavailable')}</p>}
    </div>
  );
}
