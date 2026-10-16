// Read-only live connection check. Never uses or requires a DB password/service key.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import client from '../supabase-client.js';
const context = {window: {}};
runInNewContext(readFileSync(new URL('../supabase-config.js', import.meta.url), 'utf8'), context);
try {
  const data = await client.load(context.window.SUPABASE_CONFIG);
  console.log(JSON.stringify({source: data.source, ...data.summary}, null, 2));
  if (!data.rows.length) {
    console.error('No visible records. Check the SQL import and SELECT policy.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
