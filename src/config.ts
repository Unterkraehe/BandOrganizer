/**
 * Deployment configuration. None of these values are secret (R-CODE-04):
 * the client secret lives only in the token helper (token-helper/README.md).
 */
export const config = {
  hidrive: {
    authorizeUrl: 'https://my.hidrive.com/client/authorize',
    apiBase: 'https://api.hidrive.strato.com/2.1',
    /** Client ID from the HiDrive developer registration. Empty = login not set up yet. */
    clientId: '',
    /** Read + write access to the user's files (docs/features/10 §4). */
    scope: 'user,rw',
  },
  /** Cloudflare Worker that exchanges codes/refresh tokens (token-helper/worker.js). */
  tokenHelperUrl: 'https://bandorganizer-auth.ostworkers.workers.dev',
  /** Name of the app data folder in the HiDrive home (overview §8). */
  appFolderName: '_BandApp',
  /** Default name of the upload folder (F10 §4). */
  defaultUploadFolderName: 'Band-App Uploads',
} as const;

/** The OAuth redirect target – a real static file, see public/callback.html. */
export function redirectUri(): string {
  return new URL('callback.html', window.location.origin + import.meta.env.BASE_URL).toString();
}

export const isHiDriveConfigured = (): boolean => config.hidrive.clientId.length > 0;
