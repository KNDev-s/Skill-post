import { spawnSync } from 'node:child_process';
// Force the real same-origin adapter even if a developer left a mock .env locally.
const result = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', '--mode', 'production'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_SERVICE_MODE: 'api',
      VITE_API_BASE_URL: '/api/v1',
      VITE_API_CREDENTIALS: 'same-origin',
    },
  },
);
process.exit(result.status ?? 1);
