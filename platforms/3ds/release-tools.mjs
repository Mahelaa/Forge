import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export const release = JSON.parse(await fs.readFile(path.join(here, 'release.json'), 'utf8'));
export function titleVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(x => !Number.isInteger(x) || x < 0) || parts[0] > 63 || parts[1] > 63 || parts[2] > 15) throw Error('Invalid 3DS release version');
  return (parts[0] << 10) | (parts[1] << 4) | parts[2];
}
export async function prepareTrust() {
  const pem = await fs.readFile(path.join(here, 'update-public.pem'), 'utf8');
  const der = await fs.readFile(path.join(here, 'update-root.der'));
  const rootPEM = new crypto.X509Certificate(der).toString();
  const origin = new URL(release.updateOrigin);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw Error('Update origin must be an HTTPS origin');
  const header = '#pragma once\n#define FORGE_VERSION ' + JSON.stringify(release.version) + '\n#define FORGE_TITLE_VERSION ' + titleVersion(release.version) + '\n#define FORGE_TITLE_ID UINT64_C(0x' + release.titleId + ')\n#define FORGE_UPDATE_ORIGIN ' + JSON.stringify(origin.origin) + '\n#define FORGE_MAX_PACKAGE_BYTES ' + release.maxPackageBytes + '\nstatic const unsigned char forge_update_public_key[] = ' + JSON.stringify(pem) + ';\nstatic const unsigned char forge_update_root[] = {' + [...der].join(',') + '};\nstatic const unsigned char forge_update_root_pem[] = ' + JSON.stringify(rootPEM) + ';\n';
  await fs.writeFile(path.join(here, 'include/update-trust.h'), header);
}
export async function signRelease(directory) {
  const cia = await fs.readFile(path.join(directory, 'forge-3ds.cia'));
  if (cia.length < 0x2020 || cia.length > release.maxPackageBytes) throw Error('Invalid CIA package size');
  const pem = await fs.readFile(process.env.FORGE_UPDATE_SIGNING_KEY || path.join(os.homedir(), '.forge/3ds-update-signing.pem'), 'utf8');
  const expected = await fs.readFile(path.join(here, 'update-public.pem'), 'utf8');
  const actual = crypto.createPublicKey(pem).export({type:'spki',format:'pem'});
  if (actual !== expected) throw Error('Signing key does not match the key trusted by Forge');
  const body = Buffer.alloc(60); body.write('FORGE3DS'); body.writeUInt32LE(1, 8);
  body.writeBigUInt64LE(BigInt('0x' + release.titleId), 12); body.writeUInt32LE(titleVersion(release.version), 20); body.writeUInt32LE(cia.length, 24);
  const digest = crypto.createHash('sha256').update(cia).digest(); digest.copy(body, 28);
  const signature = crypto.sign('RSA-SHA256', body, {key:pem,padding:crypto.constants.RSA_PKCS1_PADDING});
  const manifest = Buffer.concat([body, signature]);
  await fs.writeFile(path.join(directory, 'manifest.bin'), manifest);
  await fs.writeFile(path.join(directory, 'forge-update.fup'), Buffer.concat([manifest, cia]));
  await fs.writeFile(path.join(directory, 'latest.json'), JSON.stringify({version:release.version,titleVersion:titleVersion(release.version),titleId:release.titleId,size:cia.length,sha256:digest.toString('hex'),packageUrl:release.updateOrigin + '/api/updates/3ds/packages/' + digest.toString('hex') + '.cia'}, null, 2) + '\n');
}
