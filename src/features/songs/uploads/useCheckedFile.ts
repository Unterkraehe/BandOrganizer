import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkUpload, UploadFileError, type UploadKind } from '@/core/uploads/validate';

/** A chosen file + validation message (F10 §5.4). */
export function useCheckedFile(kind: UploadKind) {
  const { t } = useTranslation('uploads');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [large, setLarge] = useState(false);
  const choose = async (next: File | null) => {
    setError(null);
    setLarge(false);
    if (!next) return setFile(null);
    try {
      const result = await checkUpload(next, kind);
      setLarge(result.large);
      setFile(next);
    } catch (e) {
      setFile(null);
      setError(e instanceof UploadFileError ? t(`errors.${e.reason}`) : t('errors.failed'));
    }
  };
  return { file, error, large, choose, reset: () => setFile(null) };
}
