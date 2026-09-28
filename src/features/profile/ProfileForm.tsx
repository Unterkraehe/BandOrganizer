import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MEMBER_COLORS, NAME_MAX_LENGTH, ROLE_SUGGESTIONS, firstFreeColor, type Member, type MemberColor } from '@/features/members/model';
import { InvalidNameError, NameTakenError, type MemberInput } from '@/features/members/repository';
import { Avatar, Button, ColorSwatches, TextField } from '@/ui';
import styles from './ProfileForm.module.css';

interface ProfileFormProps {
  mode: 'create' | 'edit';
  members: Member[];
  initial?: Member;
  submitLabel: string;
  onSubmit: (input: MemberInput) => Promise<void>;
  onCancel?: () => void;
  /** "Bist du das?" → go to the existing profile (F2 §9) */
  onPickExisting?: (member: Member) => void;
}

/** Create/edit a member profile (F2 §4.2). */
export function ProfileForm({ mode, members, initial, submitLabel, onSubmit, onCancel, onPickExisting }: ProfileFormProps) {
  const { t } = useTranslation('profile');
  const [name, setName] = useState(initial?.displayName ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [color, setColor] = useState<MemberColor>(initial?.color ?? firstFreeColor(members));
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<'required' | NameTakenError | null>(null);
  const [failed, setFailed] = useState(false);

  const usedColors = new Set(members.filter((m) => m.active && m.id !== initial?.id).map((m) => m.color));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFailed(false);
    if (!name.trim() || name.trim().length > NAME_MAX_LENGTH) {
      setNameError('required');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ displayName: name, role: role || null, color });
    } catch (error) {
      setBusy(false);
      if (error instanceof NameTakenError) setNameError(error);
      else if (error instanceof InvalidNameError) setNameError('required');
      else {
        console.error(error);
        setFailed(true);
      }
    }
  };

  const nameErrorContent =
    nameError === 'required' ? (
      t('form.nameRequired')
    ) : nameError ? (
      <span className={styles.taken}>
        {t('form.nameTaken')}
        {mode === 'create' && onPickExisting && (
          <Button variant="ghost" onClick={() => onPickExisting(nameError.existing)}>
            {t('form.nameTakenAction')}
          </Button>
        )}
      </span>
    ) : undefined;

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <TextField
        label={t('form.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameError(null);
        }}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="given-name"
        autoFocus={mode === 'create'}
        error={nameErrorContent}
        required
      />
      <TextField
        label={t('form.role')}
        optionalLabel={t('form.roleOptional')}
        value={role}
        onChange={(event) => setRole(event.target.value)}
        list="role-suggestions"
        maxLength={40}
      />
      <datalist id="role-suggestions">
        {ROLE_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <ColorSwatches
        legend={t('form.color')}
        value={color}
        onChange={(value) => setColor(value as MemberColor)}
        swatches={MEMBER_COLORS.map((key, index) => ({
          value: key,
          css: `var(--member-${key})`,
          label: `${t('form.color')} ${index + 1}`,
          note: usedColors.has(key) ? t('form.colorUsed') : undefined,
        }))}
      />
      <div className={styles.preview}>
        <span className={styles.previewLabel}>{t('form.preview')}</span>
        <div className={styles.bubbleRow}>
          <Avatar name={name || '?'} color={color} />
          <div className={styles.bubble}>
            <span className={styles.bubbleName} style={{ color: `var(--member-${color})` }}>
              {name.trim() || t('form.name')}
            </span>
            <span>{t('form.previewText')}</span>
          </div>
        </div>
      </div>
      {failed && (
        <p className={styles.failed} role="alert">
          {t('form.failed')}
        </p>
      )}
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="lg" onClick={onCancel} disabled={busy}>
            {t('form.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
