import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { release } from './release-tools.mjs';
const execute=promisify(execFile);
const here=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(here,'../..');
let commitMessage;
let repository=path.resolve(project,'../forge-server'),bundlePath=path.join(project,'artifacts/3ds/forge-update.fup');
for(let i=2;i<process.argv.length;i++) {
 if(process.argv[i]==='--repo')repository=path.resolve(process.argv[++i]);
 else if(process.argv[i]==='--bundle')bundlePath=path.resolve(process.argv[++i]);
 else if(process.argv[i]==='--message')commitMessage=process.argv[++i];
 else throw Error('Usage: node platforms/3ds/publish.mjs --message "v0.03 - Description" [--repo PATH] [--bundle PATH]');
}
if(!/^v\d+\.\d{2} - \S[^\r\n]*$/.test(commitMessage||''))throw Error('A commit message in your format is required: --message "v0.03 - Description"');
const key=await fs.readFile(path.join(here,'update-public.pem')),body=await fs.readFile(bundlePath);
if(body.length<=316||!crypto.verify('RSA-SHA256',body.subarray(0,60),key,body.subarray(60,316)))throw Error('Invalid release signature');
if(body.length-316!==body.readUInt32LE(24)||!crypto.createHash('sha256').update(body.subarray(316)).digest().equals(body.subarray(28,60)))throw Error('Invalid release package checksum');
const version=body.readUInt32LE(20),repoName='Mahelaa/forge-server';
const remote=await fetch(release.updateOrigin+'/api/updates/3ds/manifest.bin',{signal:AbortSignal.timeout(15000)});
if(remote.ok){const current=Buffer.from(await remote.arrayBuffer());if(current.length!==316||!crypto.verify('RSA-SHA256',current.subarray(0,60),key,current.subarray(60)))throw Error('Current server manifest could not be verified');if(version<=current.readUInt32LE(20))throw Error('Bump release.json before publishing: this version is already published or older');}
else if(remote.status!==404)throw Error('Could not check current release: '+remote.status);
const file='embedded-3ds-update.fup';
if(process.env.FORGE_GITHUB_TOKEN) {
 const headers={Authorization:'Bearer '+process.env.FORGE_GITHUB_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 const endpoint='https://api.github.com/repos/'+repoName+'/contents/'+file;
 const existing=await fetch(endpoint+'?ref=master',{headers});if(!existing.ok&&existing.status!==404)throw Error('Cannot access GitHub release file ('+existing.status+')');
 const data=existing.ok?await existing.json():{};
 const response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({message:commitMessage,content:body.toString('base64'),branch:'master',...(data.sha?{sha:data.sha}:{})})});
 if(!response.ok)throw Error('GitHub publication failed ('+response.status+')');
 const result=await response.json();console.log('GitHub deployment started: '+result.commit.html_url);
} else {
 const git=async args=>(await execute('git',['-C',repository,...args],{windowsHide:true})).stdout.trim();
 const branch=await git(['branch','--show-current']);if(branch!=='master')throw Error('Server repository must be on master; no branch switch was made');
 const origin=await git(['remote','get-url','origin']);if(!origin.endsWith('/'+repoName+'.git')&&!origin.endsWith(':'+repoName+'.git'))throw Error('Unexpected server repository');
 const publicKey=await fs.readFile(path.join(repository,'update-public.pem'));
 if(!crypto.createPublicKey(publicKey).export({type:'spki',format:'der'}).equals(crypto.createPublicKey(key).export({type:'spki',format:'der'})))throw Error('Server and client update trust keys differ');
 await fs.writeFile(path.join(repository,file),body);
 await git(['add','--',file]);await git(['commit','--only','-m',commitMessage,'--',file]);
 await git(['push','origin','master']);console.log('GitHub deployment started for Forge 3DS '+release.version);
}
console.log('Wait for the deployment workflow to succeed; consoles can then download the update from '+release.updateOrigin);
