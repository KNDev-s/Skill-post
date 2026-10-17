import esbuild from 'esbuild';
import { execSync } from 'node:child_process';

execSync('npx tsc', { stdio: 'inherit' });

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/server.js',
  external: ['@resvg/resvg-js'],
  banner: {
    js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
  },
});
