import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, '../..');
const { release, prepareTrust, signRelease, titleVersion } = await import('./release-tools.mjs');
const version = release.version;
const policy = JSON.parse(await fs.readFile(path.join(here, 'release-policy.json'), 'utf8'));
const artifacts = path.join(project, 'artifacts');
const output = policy.retainVersions ? path.join(artifacts, '3ds/releases', version) : path.join(artifacts, '3ds');
const image = 'devkitpro/devkitarm@sha256:116afba8df8453961de2936ffab20dd441edf4d682856c1ec8b0e53d7ed0bbf5';
const tools = [
  { name: 'makerom', version: '0.18.4', url: 'https://github.com/3DSGuy/Project_CTR/releases/download/makerom-v0.18.4/makerom-v0.18.4-ubuntu_x86_64.zip', sha256: 'dd596854718c195c6e3229286be485b122921715555af8ae5cf8e9a465d9f970' },
  { name: 'ctrtool', version: '1.2.0', url: 'https://github.com/3DSGuy/Project_CTR/releases/download/ctrtool-v1.2.0/ctrtool-v1.2.0-ubuntu_x86_64.zip', sha256: 'd53f59baf5bad5339434af2bfc5bd2a9547978d6933e80eac5902f5a11b738b1' },
  { name: 'bannertool', version: '1.2.0', url: 'https://github.com/diasurgical/bannertool/releases/download/1.2.0/bannertool.zip', sha256: '69768596f836acb3e3aeaa66e47c6ba560dde813c6dfcd33c8afc25fe29b7524' }
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: project, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(command + ' exited with ' + code)));
  });
}
const cache = path.join(os.tmpdir(), 'forge-3ds-tools');
await fs.mkdir(cache, { recursive: true });
for (const tool of tools) {
  const destination = path.join(cache, tool.name + '.zip');
  let bytes = await fs.readFile(destination).catch(() => null);
  if (!bytes || hash(bytes) !== tool.sha256) {
    console.log('Downloading ' + tool.name + ' ' + tool.version);
    const response = await fetch(tool.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(tool.name + ' download failed: ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== tool.sha256) throw Error(tool.name + ' checksum mismatch');
    await fs.writeFile(destination, bytes);
  }
}
await prepareTrust();
await run(process.execPath, [path.join(here, 'prepare-assets.mjs')]);
await run('docker', ['run', '--rm', '--env', 'FORGE_VERSION=' + version, '--mount', 'type=bind,source=' + here + ',target=/work', '--mount', 'type=bind,source=' + cache + ',target=/tools', '-w', '/work', image, 'bash', '/work/package.sh']);
// Assemble the replacement before touching the currently published build.
await fs.mkdir(path.dirname(output), { recursive: true });
const staging = await fs.mkdtemp(path.join(path.dirname(output), '.forge-3ds-next-'));
let previous;
async function assertManagedDirectory(directory) {
  const relative = path.relative(artifacts, path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe artifact path: ' + directory);
  const stat = await fs.lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw Error('Unexpected artifact directory: ' + directory);
  const parent = await fs.realpath(path.dirname(directory));
  const realArtifacts = await fs.realpath(artifacts);
  const workspaceRelative = path.relative(await fs.realpath(project), realArtifacts);
  if (workspaceRelative.startsWith("..") || path.isAbsolute(workspaceRelative)) throw Error("Artifacts resolve outside the project");
  const parentRelative = path.relative(realArtifacts, parent);
  if (parentRelative.startsWith('..') || path.isAbsolute(parentRelative)) throw Error('Artifact parent is outside the expected folder');
}
try {
  const files = [];
  for (const name of ['forge-3ds.cia', 'forge-3ds.3dsx', 'forge-3ds.smdh']) {
    const bytes = await fs.readFile(path.join(here, name));
    await fs.writeFile(path.join(staging, name), bytes);
    files.push({ name, bytes: bytes.length, sha256: hash(bytes) });
  }
  await signRelease(staging);
  for (const name of ['manifest.bin', 'forge-update.fup', 'latest.json']) { const bytes = await fs.readFile(path.join(staging, name)); files.push({ name, bytes: bytes.length, sha256: hash(bytes) }); }
  await fs.writeFile(path.join(staging, 'checksums.sha256'), files.map(x => x.sha256 + '  ' + x.name).join('\n') + '\n');
  await fs.writeFile(path.join(staging, 'build-info.json'), JSON.stringify({ name: 'Forge 3DS', version, titleId: '000400000F07A100', functionality: 'Splash screen with signed online CIA updater', greeting: 'Hello its me Wario.', image, tools, files, retainVersions: policy.retainVersions, validation: 'CIA content, exheader and all ExeFS payload hashes verified', hardwareTested: false }, null, 2) + '\n');
  await assertManagedDirectory(output);
  if (await fs.lstat(output).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) {
    previous = await fs.mkdtemp(path.join(path.dirname(output), '.forge-3ds-previous-'));
    await fs.rmdir(previous);
    await fs.rename(output, previous);
  }
  try { await fs.rename(staging, output); }
  catch (error) { if (previous) await fs.rename(previous, output); previous = undefined; throw error; }
  if (previous) { await assertManagedDirectory(previous); await fs.rm(previous, { recursive: true }); }
} finally {
  if (await fs.lstat(staging).catch(error => { if (error.code === 'ENOENT') return null; throw error; })) {
    await assertManagedDirectory(staging);
    await fs.rm(staging, { recursive: true });
  }
}
console.log('Forge 3DS artifacts: ' + output);
