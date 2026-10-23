import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('assets/vendor', { recursive: true });
await build({
    entryPoints: ['node_modules/@neondatabase/neon-js/dist/index.mjs'],
    outfile: 'assets/vendor/neon-0.9.0-beta.js',
    bundle: true,
    minify: true,
    format: 'iife',
    globalName: 'NeonBackend',
    platform: 'browser',
    target: ['es2020'],
    legalComments: 'inline',
    banner: { js: '/* Black Sword Ultimate vendor bundle: @neondatabase/neon-js 0.9.0-beta, Apache-2.0. See NEON-LICENSE.txt. */' },
    logLevel: 'info'
});
copyFileSync('node_modules/@neondatabase/auth/LICENSE', 'assets/vendor/NEON-LICENSE.txt');
