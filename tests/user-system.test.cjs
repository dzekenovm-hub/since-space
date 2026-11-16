const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const {mkdtemp,rm,writeFile}=require('node:fs/promises');
const {join}=require('node:path');
const os=require('node:os');

async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port}
test('server accounts hash passwords, validate quest answers and persist user inventory securely',async t=>{
  const port=await freePort(),temp=await mkdtemp(join(os.tmpdir(),'since-space-test-')),child=spawn(process.execPath,['serve.mjs'],{cwd:join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SS_ADMIN_PASSWORD:'test-owner-password',SS_DATA_PATH:join(temp,'db.json')},stdio:'ignore'});t.after(async()=>{child.kill();await rm(temp,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${port}`;let ready=false;for(let i=0;i<80;i++){try{await fetch(base+'/api/auth/me');ready=true;break}catch{await new Promise(r=>setTimeout(r,50))}}assert.ok(ready,'server should start');
  const home=await (await fetch(base+'/')).text();assert.doesNotMatch(home,/BIOLOGY SPACE|data-page="biology"/i);
  const request=async(path,options={})=>{const response=await fetch(base+path,options);return{response,data:await response.json()}};
  let result=await request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'Orbit_7',fullName:'Orbit Seven',password:'a-strong-password'})});assert.equal(result.response.status,201);assert.equal(result.data.user.username,'orbit_7');assert.equal(JSON.stringify(result.data).includes('password'),false);let cookie=result.response.headers.get('set-cookie').split(';')[0];
  result=await request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'orbit_7',fullName:'Duplicate',password:'a-strong-password'})});assert.equal(result.response.status,409);
  result=await request('/api/auth/me',{headers:{cookie}});assert.equal(result.data.user.fullName,'Orbit Seven');
  result=await request('/api/quest/next?element=2',{headers:{cookie}});assert.equal(result.data.type,'number');assert.match(result.data.prompt,/атомный номер/i);let challenge=result.data.challengeId;
  result=await request('/api/quest/answer',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({challengeId:challenge,answer:'2'})});assert.equal(result.data.correct,true);assert.equal(result.data.status,'DISCOVERED');
  let answers=[['protons','2'],['neutrons','2']];for(const [type,answer] of answers){result=await request('/api/quest/next?element=2',{headers:{cookie}});assert.equal(result.data.type,type);challenge=result.data.challengeId;result=await request('/api/quest/answer',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({challengeId:challenge,answer})});assert.equal(result.data.correct,true)}assert.equal(result.data.status,'STUDIED');assert.equal(result.data.user.xp,35);
  result=await request('/api/inventory',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({formula:'He',name:'Гелий',amount:1})});assert.equal(result.response.status,200);assert.equal(result.data.item.formula,'He');
  result=await request('/api/inventory',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({formula:'H₂',name:'Водород',amount:1})});assert.equal(result.response.status,403);
  result=await request('/api/leaderboard');assert.equal(result.data.users[0].username,'orbit_7');assert.equal(JSON.stringify(result.data).includes('password'),false);
  result=await request('/api/admin/content');assert.equal(result.response.status,401);
  result=await request('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'test-owner-password'})});assert.equal(result.response.status,200);const adminCookie=result.response.headers.get('set-cookie').split(';')[0];
  result=await request('/api/admin/content',{headers:{cookie:adminCookie}});assert.equal(result.data.settings.elementQuestionCount,undefined);assert.equal(result.data.users.length,1);
  result=await request('/api/admin/content',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({kind:'settings',elementQuestionCount:1,questionXp:0,elementUnlockXp:0})});assert.equal(result.response.status,200);
  result=await request('/api/admin/content',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({kind:'mission',id:'test-mission',title:'Test mission',objective:'elements',target:1,reward:25})});assert.equal(result.response.status,200);
  result=await request('/api/gamify/mission',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({id:'test-mission'})});assert.equal(result.data.awarded,25);
  result=await request('/api/gamify/mission',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({id:'test-mission'})});assert.equal(result.data.awarded,0);
  result=await request('/api/admin/content',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({kind:'user',username:'orbit_7',disabled:true})});assert.equal(result.response.status,200);
  result=await request('/api/auth/me',{headers:{cookie}});assert.equal(result.data.user,null);
  await writeFile(join(temp,'db.json'),'{ broken json','utf8');
  result=await request('/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'another_user',fullName:'Another User',password:'a-strong-password'})});assert.equal(result.response.status,500);assert.match(result.data.error,/файл данных сайта/i);
});

test('Element Quest login session survives server restart and unlocks an element',async t=>{
  const port=await freePort(),temp=await mkdtemp(join(os.tmpdir(),'since-space-session-')),db=join(temp,'db.json'),cwd=join(__dirname,'..'),env={...process.env,PORT:String(port),HOST:'127.0.0.1',SS_ADMIN_PASSWORD:'test-owner-password',SS_DATA_PATH:db};
  let child=spawn(process.execPath,['serve.mjs'],{cwd,env,stdio:'ignore'});t.after(async()=>{child.kill();await rm(temp,{recursive:true,force:true})});
  const base=`http://127.0.0.1:${port}`,ready=async()=>{for(let i=0;i<100;i++){try{await fetch(base+'/api/auth/me');return}catch{await new Promise(r=>setTimeout(r,40))}}throw Error('server did not start')};await ready();
  let response=await fetch(base+'/api/auth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'restart_user',fullName:'Restart User',password:'a-strong-password'})}),cookie=response.headers.get('set-cookie').split(';')[0];assert.equal(response.status,201);
  response=await fetch(base+'/api/quest/next?element=1',{headers:{cookie}});let challenge=(await response.json()).challengeId;
  response=await fetch(base+'/api/quest/answer',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({challengeId:challenge,answer:'1'})});assert.equal((await response.json()).correct,true);
  child.kill();await new Promise(resolve=>child.once('exit',resolve));child=spawn(process.execPath,['serve.mjs'],{cwd,env,stdio:'ignore'});await ready();
  response=await fetch(base+'/api/auth/me',{headers:{cookie}});assert.equal((await response.json()).user.username,'restart_user');
  const answers={number:'1',protons:'1',neutrons:'0'};for(let i=0;i<2;i++){response=await fetch(base+'/api/quest/next?element=1',{headers:{cookie}});const q=await response.json();assert.ok(['number','protons','neutrons'].includes(q.type));response=await fetch(base+'/api/quest/answer',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({challengeId:q.challengeId,answer:answers[q.type]})});assert.equal((await response.json()).correct,true)}
  response=await fetch(base+'/api/quest/next?element=1',{headers:{cookie}});assert.equal((await response.json()).complete,true);
});
