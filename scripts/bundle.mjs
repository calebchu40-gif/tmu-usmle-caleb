import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));
if (config.cloud?.url && config.cloud?.publishableKey) {
  mkdirSync('assets/vendor', {recursive: true});
  await build({stdin: {contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd()}, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, outfile: 'assets/vendor/supabase.js', legalComments: 'eof'});
}
