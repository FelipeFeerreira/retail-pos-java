import fs from 'node:fs';import assert from 'node:assert/strict';
const env=Object.fromEntries(fs.readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const base=process.env.RESTORE_TEST_URL||'http://localhost:8081';let token='';
async function request(path,method='GET',body){
 let csrf='',cookie='';
 if(method!=='GET'){const r=await fetch(base+'/api/v1/auth/csrf');csrf=(await r.json()).token;cookie=r.headers.get('set-cookie')?.split(';')[0]||'';}
 const r=await fetch(base+'/api/v1'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(method!=='GET'?{'Content-Type':'application/json','X-XSRF-TOKEN':csrf,Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 if(!r.ok)throw new Error(path+' returned '+r.status+' '+await r.text());return r.json();
}
for(let i=0;i<60;i++){try{const r=await fetch(base+'/actuator/health');if(r.ok)break;}catch{}if(i===59)throw new Error('Test backend unavailable');await new Promise(r=>setTimeout(r,1000));}
token=(await request('/auth/login','POST',{username:'admin',password:env.ADMIN_PASSWORD})).token;
await request('/categories','POST',{name:'BEFORE-BACKUP'});
const backup=await request('/backup','POST');
await request('/categories','POST',{name:'AFTER-BACKUP'});
assert.ok((await request('/categories')).some(c=>c.name==='AFTER-BACKUP'));
await request('/backup/restore','POST',{filename:backup.filename,confirmation:'RESTAURAR'});
const categories=await request('/categories');assert.ok(categories.some(c=>c.name==='BEFORE-BACKUP'));assert.ok(!categories.some(c=>c.name==='AFTER-BACKUP'));
const backups=await request('/backup');assert.ok(backups.length>=2);
console.log('PASS: isolated PostgreSQL backup/restore, transactional replacement and automatic pre-restore safety snapshot.');
