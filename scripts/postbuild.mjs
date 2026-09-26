// GitHub Pages serves 404.html for unknown paths. Copying index.html there makes
// deep links like /BandOrganizer/songs work after a reload (SPA fallback, R-CODE-09).
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
console.log('postbuild: dist/404.html created (SPA fallback)');
