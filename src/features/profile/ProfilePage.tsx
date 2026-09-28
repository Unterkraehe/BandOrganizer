import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/core/session/BandSession';
import { Page } from '@/ui';
import { ProfileForm } from './ProfileForm';

/** Edit own profile (F2 §4.3). */
export function ProfilePage() {
  const { t } = useTranslation('profile');
  const { currentMember, members, updateProfile } = useSession();
  const navigate = useNavigate();
  if (!currentMember) return null;
  return (
    <Page title={t('form.editTitle')}>
      <ProfileForm
        mode="edit"
        members={members}
        initial={currentMember}
        submitLabel={t('form.submitEdit')}
        onSubmit={async (input) => {
          await updateProfile(input);
          navigate(-1);
        }}
        onCancel={() => navigate(-1)}
      />
    </Page>
  );
}
