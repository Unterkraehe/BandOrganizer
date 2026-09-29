import { Minus, Plus, Repeat, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SEMITONES_MAX, TEMPO_MAX, TEMPO_MIN, type PlayerState } from '@/core/audio/engine';
import { formatDuration } from '@/core/i18n/format';
import type { AudioEngine } from '@/core/audio/engine';
import { Button, IconButton } from '@/ui';
import styles from './Practice.module.css';

/** Tempo, pitch (independent) and A–B loop controls (F4 §4.3, F9). */
export function PracticeControls({ engine, state, compact = false }: { engine: AudioEngine; state: PlayerState; compact?: boolean }) {
  const { t } = useTranslation('songs');
  const tempoPercent = Math.round(state.tempo * 100);
  const setTempo = (percent: number) => engine.setEffects({ tempo: Math.min(TEMPO_MAX * 100, Math.max(TEMPO_MIN * 100, percent)) / 100 });
  const setPitch = (semitones: number) => engine.setEffects({ semitones: Math.max(-SEMITONES_MAX, Math.min(SEMITONES_MAX, semitones)) });
  const loop = state.loop;
  const pitchLabel =
    state.semitones === 0 ? t('practice.pitchZero') : `${state.semitones > 0 ? '+' : '−'}${t('practice.pitchValue', { count: Math.abs(state.semitones) })}`;

  const setA = () => {
    const start = state.position;
    const end = loop && loop.end > start + 1 ? loop.end : Math.min(state.duration, start + 8);
    engine.setLoop({ start, end, enabled: true });
  };
  const setB = () => {
    const end = state.position;
    const start = loop && loop.start < end - 1 ? loop.start : Math.max(0, end - 8);
    engine.setLoop({ start, end, enabled: true });
  };

  return (
    <div className={compact ? `${styles.controls} ${styles.compact}` : styles.controls}>
      <div className={styles.control}>
        <div className={styles.controlHead}>
          <span className={styles.controlLabel}>{t('practice.tempo')}</span>
          <span className={styles.value}>{t('practice.tempoValue', { value: tempoPercent })}</span>
        </div>
        <div className={styles.row}>
          <IconButton label={t('practice.slower')} icon={<Minus size={20} />} onClick={() => setTempo(Math.round((tempoPercent - 5) / 5) * 5)} disabled={tempoPercent <= TEMPO_MIN * 100} />
          <input
            type="range"
            className={styles.slider}
            min={TEMPO_MIN * 100}
            max={TEMPO_MAX * 100}
            step={1}
            value={tempoPercent}
            onChange={(e) => setTempo(Number(e.target.value))}
            aria-label={t('practice.tempo')}
            aria-valuetext={t('practice.tempoValue', { value: tempoPercent })}
          />
          <IconButton label={t('practice.faster')} icon={<Plus size={20} />} onClick={() => setTempo(Math.round((tempoPercent + 5) / 5) * 5)} disabled={tempoPercent >= TEMPO_MAX * 100} />
          <Button variant="ghost" onClick={() => setTempo(100)} disabled={tempoPercent === 100}>
            {t('practice.original')}
          </Button>
        </div>
      </div>

      <div className={styles.control}>
        <div className={styles.controlHead}>
          <span className={styles.controlLabel}>{t('practice.pitch')}</span>
          <span className={styles.value}>{pitchLabel}</span>
        </div>
        <div className={styles.row}>
          <IconButton label={t('practice.lower')} icon={<Minus size={20} />} onClick={() => setPitch(state.semitones - 1)} disabled={state.semitones <= -SEMITONES_MAX} />
          <span className={styles.pitchValue} aria-live="polite">
            {state.semitones > 0 ? `+${state.semitones}` : state.semitones}
          </span>
          <IconButton label={t('practice.higher')} icon={<Plus size={20} />} onClick={() => setPitch(state.semitones + 1)} disabled={state.semitones >= SEMITONES_MAX} />
          <Button variant="ghost" onClick={() => setPitch(0)} disabled={state.semitones === 0}>
            {t('practice.original')}
          </Button>
        </div>
      </div>

      <div className={styles.control}>
        <div className={styles.controlHead}>
          <span className={styles.controlLabel}>{t('practice.loop')}</span>
          <span className={styles.value}>{loop ? t('practice.loopRange', { start: formatDuration(loop.start), end: formatDuration(loop.end) }) : ''}</span>
        </div>
        <div className={styles.row}>
          <Button onClick={setA} disabled={!state.track || state.duration <= 0}>
            {t('practice.setA')}
          </Button>
          <Button onClick={setB} disabled={!state.track || state.duration <= 0}>
            {t('practice.setB')}
          </Button>
          <Button
            variant={loop?.enabled ? 'primary' : 'secondary'}
            icon={<Repeat size={18} />}
            aria-pressed={Boolean(loop?.enabled)}
            onClick={() => loop && engine.setLoop({ ...loop, enabled: !loop.enabled })}
            disabled={!loop}
          >
            {loop?.enabled ? t('practice.loopOn') : t('practice.loopOff')}
          </Button>
          <IconButton label={t('practice.clearLoop')} icon={<X size={18} />} onClick={() => engine.setLoop(null)} disabled={!loop} />
        </div>
        {/* always takes its space: nothing below may move when a loop is set or cleared */}
        {!compact && (
          <p className={styles.hint} style={{ visibility: loop ? 'hidden' : 'visible' }} aria-hidden={Boolean(loop)}>
            {t('practice.loopHint')}
          </p>
        )}
      </div>

      {state.error === 'effects' && <p className={styles.warning}>{t('practice.effectsUnavailable')}</p>}
      {/* Always present (disabled while everything is original): appearing/disappearing moved the whole view */}
      <Button
        variant="ghost"
        icon={<RotateCcw size={18} />}
        disabled={state.tempo === 1 && state.semitones === 0 && !loop}
        onClick={() => {
          engine.setEffects({ tempo: 1, semitones: 0 });
          engine.setLoop(null);
        }}
      >
        {t('practice.reset')}
      </Button>
    </div>
  );
}
