import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {Client}=require('@stomp/stompjs');
import assert from 'node:assert/strict';
const env=Object.fromEntries(fs.readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const base=process.env.BASE_URL||'http://localhost:3000';
let token='',cookie='',csrf='';
async function call(path,{method='GET',body}={}){
 if(method!=='GET'){const response=await fetch(base+'/api/v1/auth/csrf');assert.equal(response.status,200);cookie=response.headers.get('set-cookie')?.split(';')[0]||cookie;csrf=(await response.json()).token;}
 const response=await fetch(base+'/api/v1'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{}),...(method!=='GET'?{'X-XSRF-TOKEN':csrf,Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(path+' -> '+response.status+' '+await response.text());
 return response.headers.get('content-type')?.includes('json')?response.json():response.arrayBuffer();
}
const login=await call('/auth/login',{method:'POST',body:{username:'admin',password:env.ADMIN_PASSWORD}});token=login.token;
assert.equal(login.role,'ADMIN');
const catalog=await call('/products');assert.ok(catalog.content.length>=8);
const alerts=await call('/alerts');assert.ok(Array.isArray(alerts));
const settings=await call('/settings');assert.ok(settings['store.name']);
const csrfMissing=await fetch(base+'/api/v1/categories',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:'SHOULD-NOT-EXIST'})});assert.equal(csrfMissing.status,403);
const notAuthenticated=await fetch(base+'/api/v1/products');assert.equal(notAuthenticated.status,401);
const elapsed=[];
for(let i=0;i<25;i++){const start=performance.now();await call('/products?q=arroz');elapsed.push(performance.now()-start);}
elapsed.sort((a,b)=>a-b);
await new Promise((resolve,reject)=>{
 const client=new Client({brokerURL:base.replace('http','ws')+'/ws/updates',connectHeaders:{Authorization:'Bearer '+token},reconnectDelay:0});
 const timeout=setTimeout(()=>{void client.deactivate();reject(new Error('WebSocket update timeout'));},10000);
 client.onStompError=()=>{clearTimeout(timeout);void client.deactivate();reject(new Error('STOMP authentication failed'));};
 client.onConnect=()=>{client.subscribe('/topic/updates',message=>{if(JSON.parse(message.body).type==='stock'){clearTimeout(timeout);void client.deactivate();resolve();}});setTimeout(()=>{void call('/stock-movements',{method:'POST',body:{productId:catalog.content[0].id,type:'IN',quantity:0,reason:'Verificação de atualização em tempo real'}}).catch(reject);},150);};
 client.activate();
});
console.log('PASS: authenticated STOMP update after commit. Search HTTP p95 (25 warm local queries): '+elapsed[23].toFixed(1)+' ms.');
const backup=await call('/backup',{method:'POST'});assert.match(backup.filename,/^backup-.*\.dump$/);
const list=await call('/backup');assert.ok(list.some(b=>b.filename===backup.filename && b.bytes>0));
const openapi=await fetch('http://localhost:8080/v3/api-docs');assert.equal(openapi.status,200);
const spec=await openapi.json();assert.ok(spec.paths['/api/v1/sales']);assert.ok(spec.paths['/api/v1/cash/sessions/{id}/close']);
fs.mkdirSync(new URL('../docs/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../docs/openapi.json',import.meta.url),JSON.stringify(spec,null,2));
console.log('PASS: login JWT + CSRF, catalog, alerts, settings, unauthorized/CSRF rejection, pg_dump backup, OpenAPI ('+Object.keys(spec.paths).length+' paths).');
