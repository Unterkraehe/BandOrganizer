import { useTranslation } from 'react-i18next';
import { useSession } from '@/core/session/BandSession';
import { Page } from '@/ui';
import { ProfileForm } from './ProfileForm';
import { useBack } from '@/ui/layout/navigation';

/** Edit own profile (F2 §4.3). */
export function ProfilePage() {
  const { t } = useTranslation('profile');
  const { currentMember, members, updateProfile } = useSession();
  const { goBack } = useBack();
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
          goBack();
        }}
        onCancel={() => goBack()}
      />
    </Page>
  );
}
