import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('site.config.json', 'utf8'));
if (!config.standaloneQuestionBank) {
  await build({stdin: {contents: 'export { createClient } from "@supabase/supabase-js";', resolveDir: process.cwd()}, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, outfile: 'dist/assets/vendor/supabase.js', legalComments: 'eof'});
}
