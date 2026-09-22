// Pin and vendor the existing certified browser SDK, including its license.
// No application runtime request to an external script CDN is required afterward.
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const version = '2.116.0';
async function checkedFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Vendor fetch failed: HTTP ${response.status}`);
  return response;
}
const metadata = await (await checkedFetch(`https://registry.npmjs.org/@supabase/supabase-js/${version}`)).json();
if (metadata.version !== version || !metadata.dist?.integrity?.startsWith('sha512-')) throw new Error('Unexpected SDK metadata');
const archive = Buffer.from(await (await checkedFetch(metadata.dist.tarball)).arrayBuffer());
const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');
if (integrity !== metadata.dist.integrity) throw new Error('SDK integrity verification failed');
const temp = await mkdtemp(join(tmpdir(), 'wordstrike-sdk-'));
try {
  const packed = join(temp, 'sdk.tgz');
  await writeFile(packed, archive);
  const sdk = execFileSync('tar', ['-xOf', packed, 'package/dist/umd/supabase.js'], { maxBuffer: 8 * 1024 * 1024 });
  const license = execFileSync('tar', ['-xOf', packed, 'package/LICENSE']);
  await mkdir('vendor', { recursive: true });
  await writeFile(`vendor/supabase-${version}.js`, sdk);
  await writeFile('vendor/supabase-LICENSE.txt', license);
  await writeFile(`vendor/supabase-${version}.integrity.json`, JSON.stringify({ version, npmIntegrity: integrity, bundleSHA256: createHash('sha256').update(sdk).digest('hex') }, null, 2) + '\n');
  console.log(`Vendored Supabase ${version}: ${sdk.length} bytes; npm SHA-512 verified.`);
} finally { await rm(temp, { recursive: true, force: true }); }
