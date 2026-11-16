import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const databasePath = process.env.SS_DATA_PATH || join(root, '.since-space-data.json');
const elements = JSON.parse(await readFile(join(root, 'elements.json'), 'utf8'));
const reactionSources=await Promise.all(['lab-enhancements.js','reaction-library.js'].map(file=>readFile(join(root,file),'utf8')));
const reactionEquations=new Map(reactionSources.flatMap(source=>[...source.matchAll(/\{id:'([^']+)'[^\r\n]*?equation:'([^']+)'/g)].map(x=>[x[1],x[2]])));
const reactionIds = new Set(reactionEquations.keys());
const scrypt = promisify(scryptCallback);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.bin': 'application/octet-stream' };
const sessions = new Set();
const userSessions = new Map();
const adminPassword = process.env.SS_ADMIN_PASSWORD || '';
function sendJson(res, code, data, cookie = '') {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  res.end(JSON.stringify(data));
}
function sessionFrom(req) { return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('ss_admin_session='))?.split('=')[1] || ''; }
function isAdmin(req) { const token = sessionFrom(req); return Boolean(token && sessions.has(token)); }
function userSessionFrom(req) { return (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('ss_user_session='))?.split('=')[1] || ''; }
function currentUser(req, data) {
  const token=userSessionFrom(req);if(!token)return null;
  const digest=createHash('sha256').update(token).digest('hex');
  const user=(data.users||[]).find(item=>!item.disabled&&(item.sessions||[]).some(session=>session.digest===digest&&session.expiresAt>Date.now()));
  if(user&&!userSessions.has(token))userSessions.set(token,{userId:user.id,challenge:null});
  return user||null;
}
function publicUser(user) { return { id:user.id, username:user.username, fullName:user.fullName, registeredAt:user.registeredAt, xp:user.xp||0, level:userLevel(user.xp||0), progress:user.progress||{} }; }
function userLevel(xp) { return xp>=2000?'Master':xp>=1000?'Scientist':xp>=450?'Researcher':xp>=150?'Student':'Beginner'; }
function userCookie(token, maxAge=2592000) { return `ss_user_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`; }
function rememberSession(user,token){const now=Date.now();user.sessions=(user.sessions||[]).filter(x=>x.expiresAt>now).slice(-9);user.sessions.push({digest:createHash('sha256').update(token).digest('hex'),expiresAt:now+2592000*1000});}
async function bodyJson(req) { let body=''; for await(const chunk of req){body+=chunk;if(body.length>20000)throw new Error('Request too large')} return JSON.parse(body||'{}'); }
const questionTypes=['number','protons','neutrons'];
function balancedEquation(source){
  try{const sides=String(source).replace(/[↑↓]/g,'').split(/→|⇌/);if(sides.length!==2)return false;const total=side=>{const result={};for(const raw of side.split(/\s+\+\s+/)){const m=raw.trim().match(/^(\d+)\s*(.+)$/),coef=m?Number(m[1]):1,formula=(m?m[2]:raw).trim().replace(/[₀-₉]/g,d=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/\^(\d+)?[+-]$/,'').replace(/[+-]\d*$/,'');if(!formula||coef<1||coef>999)return null;const atoms={};let i=0;function group(stop=''){while(i<formula.length){if(formula[i]===')'||formula[i]===']'){if(!stop)throw 0;i++;return}if(formula[i]==='('||formula[i]==='['){const close=formula[i++]==='('?')':']',inner=group(close),m=formula.slice(i).match(/^\d+/),n=m?Number(m[0]):1;if(m)i+=m[0].length;for(const [k,v] of Object.entries(inner))atoms[k]=(atoms[k]||0)+v*n;continue}const el=formula.slice(i).match(/^[A-Z][a-z]?/);if(!el)throw 0;i+=el[0].length;const m=formula.slice(i).match(/^\d+/),n=m?Number(m[0]):1;if(m)i+=m[0].length;atoms[el[0]]=(atoms[el[0]]||0)+n}if(stop)throw 0;return atoms}const counts=group();for(const [k,v] of Object.entries(counts))result[k]=(result[k]||0)+v*coef}return result};const a=total(sides[0]),b=total(sides[1]);return Boolean(a&&b&&Object.keys({...a,...b}).every(k=>a[k]===b[k]))}catch{return false}
}
function parseAtoms(formula){
  const text=String(formula||'').replace(/[₀-₉]/g,d=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/\^(\d+)?[+-]$/,'').replace(/[+-]\d*$/,'').replace(/\s/g,'');if(!text||!/^[A-Za-z0-9()[\]·.]+$/.test(text))throw new Error('Некорректный состав формулы.');const symbols=new Set(elements.map(x=>x.symbol)),sum={};
  for(const part of text.split(/[·.]/)){let source=part,leading=source.match(/^(\d+)(?=[A-Z])/),mult=leading?Number(leading[1]):1;if(leading)source=source.slice(leading[0].length);let i=0;const group=close=>{const atoms={};while(i<source.length){if(source[i]===')'||source[i]===']'){if(!close)throw 0;i++;return atoms}if(source[i]==='('||source[i]==='['){const expected=source[i++]==='('?')':']',inner=group(expected),m=source.slice(i).match(/^\d+/),n=m?Number(m[0]):1;if(m)i+=m[0].length;for(const [k,v]of Object.entries(inner))atoms[k]=(atoms[k]||0)+v*n;continue}const element=source.slice(i).match(/^[A-Z][a-z]?/);if(!element||!symbols.has(element[0]))throw 0;i+=element[0].length;const m=source.slice(i).match(/^\d+/),n=m?Number(m[0]):1;if(m)i+=m[0].length;atoms[element[0]]=(atoms[element[0]]||0)+n}if(close)throw 0;return atoms};const atoms=group();for(const [k,v]of Object.entries(atoms))sum[k]=(sum[k]||0)+v*mult}return sum;
}
function questionFor(element,type,override) {
  const massNumberOverrides={Cl:35,Ar:40,Fe:56,Cu:63,Ga:69,Ge:74,Br:79,Ag:107,Cd:114,Sn:120,Sb:121,Te:130,Xe:132,Nd:142,Sm:152,Gd:158,Yb:174,Os:192,Hg:202,Pb:208};
  const massNumber=massNumberOverrides[element.symbol]||Math.round(Number(element.mass));
  const questions={number:{prompt:`Какой атомный номер у элемента ${element.name} (${element.symbol})?`,answer:String(element.num),explanation:`Атомный номер ${element.num} — это число протонов в ядре ${element.symbol}.`},protons:{prompt:`Сколько протонов в ядре атома ${element.symbol}?`,answer:String(element.num),explanation:`У ${element.symbol} ${element.num} протонов. Число протонов всегда равно атомному номеру.`},neutrons:{prompt:`Сколько нейтронов в изотопе ${element.symbol}-${massNumber}?`,answer:String(massNumber-element.num),explanation:`В изотопе ${element.symbol}-${massNumber}: нейтроны = массовое число ${massNumber} − протоны ${element.num} = ${massNumber-element.num}. У других изотопов число нейтронов может отличаться.`}};
  return {type,...questions[type],...(override||{})};
}
async function readDatabase() {
  try { return JSON.parse(await readFile(databasePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { wall: [{ id: 'sample-1', text: 'mdnm тут был ✌', author: 'mdnm', tag: 'СТЕНА', date: 'пример', likes: 2 }, { id: 'sample-2', text: 'кто-нибудь уже смешал Na и Cl? 👀', author: 'orbit_7', tag: 'СТЕНА', date: 'пример', likes: 4 }], users:[], missions:[], questions:[] };
    throw new Error('Не удалось прочитать файл данных сайта. Проверь .since-space-data.json и права доступа.', { cause:error });
  }
}
async function writeDatabase(data) {
  await mkdir(dirname(databasePath), { recursive:true });
  const temporaryPath=`${databasePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporaryPath, databasePath);
}
createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    if(url.pathname==='/api/health'&&req.method==='GET')return sendJson(res,200,{ok:true,adminConfigured:Boolean(adminPassword)});
    if(url.pathname==='/api/auth/register'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Проверь введённые данные.'})}
      const username=String(input.username||'').trim().toLowerCase(),fullName=String(input.fullName||'').trim(),password=String(input.password||'');
      if(!/^[a-z0-9_]{3,24}$/.test(username))return sendJson(res,400,{error:'Username: 3–24 символа, латинские буквы, цифры и _.'});
      if(fullName.length<1||fullName.length>60)return sendJson(res,400,{error:'Имя должно содержать 1–60 символов.'});
      if(password.length<10||password.length>200)return sendJson(res,400,{error:'Пароль должен содержать не менее 10 символов.'});
      const data=await readDatabase();data.users||=[];if(data.users.some(user=>user.username===username))return sendJson(res,409,{error:'Этот username уже занят.'});
      const salt=randomBytes(16),hash=await scrypt(password,salt,64);const user={id:randomBytes(16).toString('hex'),username,fullName,registeredAt:new Date().toISOString(),password:{salt:salt.toString('hex'),hash:hash.toString('hex')},xp:0,progress:{elements:{},completed:{},achievements:[],createdCompounds:0,reactions:0,equations:0}};
      const token=randomBytes(32).toString('hex');rememberSession(user,token);data.users.push(user);await writeDatabase(data);userSessions.set(token,{userId:user.id,challenge:null});return sendJson(res,201,{user:publicUser(user)},userCookie(token));
    }
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Проверь введённые данные.'})}const username=String(input.username||'').trim().toLowerCase(),password=String(input.password||'');const data=await readDatabase(),user=data.users?.find(item=>item.username===username);if(!user||user.disabled)return sendJson(res,401,{error:'Неверный username или пароль.'});const actual=Buffer.from(await scrypt(password,Buffer.from(user.password.salt,'hex'),64)),expected=Buffer.from(user.password.hash,'hex');if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return sendJson(res,401,{error:'Неверный username или пароль.'});const token=randomBytes(32).toString('hex');rememberSession(user,token);await writeDatabase(data);userSessions.set(token,{userId:user.id,challenge:null});return sendJson(res,200,{user:publicUser(user)},userCookie(token));
    }
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){const token=userSessionFrom(req),data=await readDatabase(),digest=createHash('sha256').update(token).digest('hex');for(const user of data.users||[])user.sessions=(user.sessions||[]).filter(x=>x.digest!==digest);userSessions.delete(token);await writeDatabase(data);return sendJson(res,200,{authenticated:false},userCookie('',0))}
    if(url.pathname==='/api/auth/me'&&req.method==='GET'){const data=await readDatabase(),user=currentUser(req,data);return sendJson(res,200,{user:user?publicUser(user):null})}
    if(url.pathname==='/api/users'&&req.method==='GET'){const data=await readDatabase(),users=(data.users||[]).filter(u=>!u.disabled).map(publicUser).sort((a,b)=>b.xp-a.xp||a.username.localeCompare(b.username));return sendJson(res,200,{count:users.length,users})}
    const publicProfile=url.pathname.match(/^\/api\/users\/([a-z0-9_]{3,24})$/);
    if(publicProfile&&req.method==='GET'){const data=await readDatabase(),user=data.users?.find(x=>x.username===publicProfile[1].toLowerCase()&&!x.disabled);return user?sendJson(res,200,{user:publicUser(user)}):sendJson(res,404,{error:'Профиль не найден.'})}
    if(url.pathname==='/api/leaderboard'&&req.method==='GET'){const data=await readDatabase();return sendJson(res,200,{users:(data.users||[]).filter(u=>!u.disabled).map(publicUser).sort((a,b)=>b.xp-a.xp).slice(0,50)})}
    if(url.pathname==='/api/missions'&&req.method==='GET'){const data=await readDatabase();return sendJson(res,200,{missions:data.missions||[]})}
    if(url.pathname==='/api/achievements'&&req.method==='GET'){const data=await readDatabase();return sendJson(res,200,{achievements:data.achievements||[]})}
    if(url.pathname==='/api/progress'&&req.method==='GET'){const data=await readDatabase(),user=currentUser(req,data);return user?sendJson(res,200,{user:publicUser(user)}):sendJson(res,401,{error:'Войди в аккаунт.'})}
    if(url.pathname==='/api/inventory'&&req.method==='GET'){const data=await readDatabase(),user=currentUser(req,data);return user?sendJson(res,200,{items:user.inventory||[]}):sendJson(res,401,{error:'Войди в аккаунт.'})}
    if(url.pathname==='/api/inventory'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Проверь вещество.'})}const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});const formula=String(input.formula||'').trim(),name=String(input.name||formula).trim().slice(0,80),amount=Math.max(.01,Math.min(1000,Number(input.amount)||1));let atoms;try{atoms=parseAtoms(formula)}catch{return sendJson(res,400,{error:'Формула записана некорректно.'})}const unknown=Object.keys(atoms).find(symbol=>!Object.values(user.progress.elements||{}).some(x=>x.status==='STUDIED')||!user.progress.elements[String(elements.find(x=>x.symbol===symbol)?.num)]||user.progress.elements[String(elements.find(x=>x.symbol===symbol)?.num)].status!=='STUDIED');if(unknown)return sendJson(res,403,{error:`Сначала изучи элемент ${unknown} в Element Quest.`});user.inventory||=[];const key=formula.replace(/[₀-₉]/g,d=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/[\s.·]/g,'').replace(/\^(\d+)?[+-]$/,'').replace(/[+-]\d*$/,'');let item=user.inventory.find(x=>x.key===key);if(item)item.amount=Number((item.amount+amount).toFixed(3));else{item={id:key,key,formula, name,amount,createdAt:new Date().toISOString(),source:'builder'};user.inventory.push(item);user.progress.createdCompounds=(user.progress.createdCompounds||0)+1;user.progress.completed||={};const rewardKey=`compound:${key}`;if(!user.progress.completed[rewardKey]){user.progress.completed[rewardKey]=true;user.xp=(user.xp||0)+15}}await writeDatabase(data);return sendJson(res,200,{item,user:publicUser(user)});
    }
    const inventoryDelete=url.pathname.match(/^\/api\/inventory\/(.+)$/);if(inventoryDelete&&req.method==='DELETE'){const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});user.inventory=(user.inventory||[]).filter(x=>x.key!==decodeURIComponent(inventoryDelete[1]));await writeDatabase(data);return sendJson(res,200,{deleted:true})}
    if(url.pathname==='/api/quest/next'&&req.method==='GET'){
      const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});const num=Number(url.searchParams.get('element')),element=elements.find(x=>x.num===num);if(!element)return sendJson(res,404,{error:'Элемент не найден.'});const record=user.progress.elements[String(num)]||{status:'LOCKED',answered:[]};record.answered=(record.answered||[]).filter(type=>questionTypes.includes(type));const required=questionTypes.length,type=questionTypes.find(x=>!record.answered.includes(x));if(record.answered.length>=required){if(record.status!=='STUDIED'){record.status='STUDIED';user.progress.completed||={};const key=`element:${num}`;if(!user.progress.completed[key]){user.progress.completed[key]=true;const reward=Number(data.settings?.elementUnlockXp);user.xp=(user.xp||0)+Math.max(0,Math.min(500,Number.isFinite(reward)?reward:20))}await writeDatabase(data)}return sendJson(res,200,{complete:true,status:record.status})}if(!type)return sendJson(res,500,{error:'Для Element Quest не настроено достаточно разных вопросов.'});const override=(data.questions||[]).find(x=>Number(x.element)===num&&x.type===type);const question=questionFor(element,type,override),challengeId=randomBytes(16).toString('hex');const session=userSessions.get(userSessionFrom(req));session.challenge={id:challengeId,num,type,answer:question.answer,explanation:question.explanation,expiresAt:Date.now()+300000,required};return sendJson(res,200,{challengeId,prompt:question.prompt,type,options:question.options,progress:record.answered.length,total:required});
    }
    if(url.pathname==='/api/quest/answer'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Некорректный ответ.'})}const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});const token=userSessionFrom(req),session=userSessions.get(token),challenge=session?.challenge;if(!challenge||challenge.id!==input.challengeId||challenge.expiresAt<Date.now())return sendJson(res,400,{error:'Вопрос истёк. Запроси следующий.'});const correct=String(input.answer||'').trim().toLowerCase()===String(challenge.answer).toLowerCase();session.challenge=null;let record=user.progress.elements[String(challenge.num)]||{status:'LOCKED',answered:[]};let xp=0;if(correct&&!record.answered.includes(challenge.type)){record.answered.push(challenge.type);record.status='DISCOVERED';const questionReward=Number(data.settings?.questionXp),elementReward=Number(data.settings?.elementUnlockXp);xp=Math.max(0,Math.min(100,Number.isFinite(questionReward)?questionReward:5));user.xp=(user.xp||0)+xp;if(challenge.type==='number'){user.progress.numberAnswers||=[];if(!user.progress.numberAnswers.includes(challenge.num))user.progress.numberAnswers.push(challenge.num)}if(record.answered.length>=challenge.required){record.status='STUDIED';if(!user.progress.completed[`element:${challenge.num}`]){user.progress.completed[`element:${challenge.num}`]=true;const unlockXp=Math.max(0,Math.min(500,Number.isFinite(elementReward)?elementReward:20));xp+=unlockXp;user.xp+=unlockXp}}user.progress.elements[String(challenge.num)]=record;await writeDatabase(data)}return sendJson(res,200,{correct,explanation:challenge.explanation,xp,status:record.status,progress:record.answered.length,total:challenge.required,user:publicUser(user)});
    }
    if(url.pathname==='/api/gamify/event'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Некорректное событие.'})}const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});const type=String(input.type||''),entity=String(input.entity||'').trim().slice(0,100),rewards={compound:15,reaction:20,equation:10};if(!rewards[type]||!entity)return sendJson(res,400,{error:'Неизвестное событие.'});if(type==='reaction'&&!reactionIds.has(entity))return sendJson(res,400,{error:'Неизвестная реакция.'});if(type==='equation'&&!balancedEquation(entity))return sendJson(res,400,{error:'Уравнение не сбалансировано.'});if(type==='compound'&&!/^[A-Za-z0-9₀-₉()[\]·.^+-]{1,80}$/.test(entity))return sendJson(res,400,{error:'Некорректная формула.'});user.progress.completed||={};const key=`${type}:${type==='compound'?entity.replace(/[₀-₉]/g,d=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))):entity}`;if(user.progress.completed[key])return sendJson(res,200,{awarded:0,user:publicUser(user)});const day=new Date().toISOString().slice(0,10);user.progress.dailyXp||={};if(user.progress.dailyXp.day!==day)user.progress.dailyXp={day,total:0};if(user.progress.dailyXp.total>=200)return sendJson(res,429,{error:'Дневной лимит бонусного XP достигнут.'});user.progress.completed[key]=true;const counter=type==='compound'?'createdCompounds':type==='reaction'?'reactions':type==='reaction'?'reactions':'equations';user.progress[counter]=(user.progress[counter]||0)+1;if(type==='reaction'){try{const right=reactionEquations.get(entity).split(/→|⇌/)[1].replace(/[↑↓]/g,'');for(const part of right.split(/\s+\+\s+/)){const m=part.trim().match(/^(\d+)\s*(.+)$/),coef=m?Number(m[1]):1,formula=(m?m[2]:part).trim(),atoms=parseAtoms(formula);if(!Object.keys(atoms).every(symbol=>user.progress.elements[String(elements.find(e=>e.symbol===symbol)?.num)]?.status==='STUDIED'))continue;user.inventory||=[];const formulaKey=formula.replace(/[₀-₉]/g,d=>String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))).replace(/[\s.·]/g,'').replace(/\^(\d+)?[+-]$/,'').replace(/[+-]\d*$/,'');const existing=user.inventory.find(x=>x.key===formulaKey);if(existing)existing.amount=Number((existing.amount+coef).toFixed(3));else user.inventory.push({id:formulaKey,key:formulaKey,formula,name:formula,amount:coef,createdAt:new Date().toISOString(),source:'reaction'})}}catch{}}user.xp=(user.xp||0)+rewards[type];user.progress.dailyXp.total+=rewards[type];await writeDatabase(data);return sendJson(res,200,{awarded:rewards[type],user:publicUser(user)});
    }
    if(url.pathname==='/api/gamify/mission'&&req.method==='POST'){
      let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Некорректная миссия.'})}const data=await readDatabase(),user=currentUser(req,data);if(!user)return sendJson(res,401,{error:'Войди в аккаунт.'});const defaults=[{id:'first-discovery',objective:'discovered',target:5,reward:80},{id:'atom-master',objective:'numberAnswers',target:10,reward:100},{id:'period-hunter',objective:'period',target:1,reward:120},{id:'metal-collector',objective:'metals',target:10,reward:100},{id:'chemistry-explorer',objective:'compounds',target:5,reward:120},{id:'reaction-master',objective:'reactions',target:5,reward:150},{id:'formula-expert',objective:'equations',target:10,reward:150}],p=user.progress;let mission=data.missions?.find(x=>x.id===input.id)||defaults.find(x=>x.id===input.id);if(!mission)return sendJson(res,404,{error:'Миссия не найдена.'});const studiedEntries=Object.entries(p.elements||{}).filter(([,x])=>x.status==='STUDIED'),periodCounts={};for(const [num] of studiedEntries){const el=elements[Number(num)-1];if(el)periodCounts[el.period]=(periodCounts[el.period]||0)+1}const periodTotals={};for(const el of elements)periodTotals[el.period]=(periodTotals[el.period]||0)+1;const metrics={elements:studiedEntries.length,discovered:Object.values(p.elements||{}).filter(x=>x.status!=='LOCKED').length,reactions:p.reactions||0,compounds:p.createdCompounds||0,equations:p.equations||0,numberAnswers:(p.numberAnswers||[]).length,metals:studiedEntries.filter(([n])=>['metal','alkali'].includes(elements[Number(n)-1]?.type)).length,period:Object.keys(periodTotals).some(n=>periodCounts[n]>=periodTotals[n])?1:0};if((metrics[mission.objective]||0)<mission.target)return sendJson(res,409,{error:'Требование миссии ещё не выполнено.'});p.completed||={};const key=`mission:${mission.id}`;if(p.completed[key])return sendJson(res,200,{awarded:0,user:publicUser(user)});p.completed[key]=true;user.xp=(user.xp||0)+mission.reward;await writeDatabase(data);return sendJson(res,200,{awarded:mission.reward,user:publicUser(user)});
    }
    if(url.pathname==='/api/admin/content'&&req.method==='GET'){
      if(!isAdmin(req))return sendJson(res,401,{error:'Нужен доступ автора.'});const data=await readDatabase();return sendJson(res,200,{users:(data.users||[]).map(u=>({...publicUser(u),disabled:!!u.disabled})),missions:data.missions||[],questions:data.questions||[],achievements:data.achievements||[],settings:data.settings||{questionXp:5,elementUnlockXp:20}});
    }
    if(url.pathname==='/api/admin/content'&&req.method==='POST'){
      if(!isAdmin(req))return sendJson(res,401,{error:'Нужен доступ автора.'});let input;try{input=await bodyJson(req)}catch{return sendJson(res,400,{error:'Проверь данные.'})}const data=await readDatabase();data.missions||=[];data.questions||=[];data.achievements||=[];
      if(input.kind==='settings'){data.settings={questionXp:Math.max(0,Math.min(100,Number(input.questionXp)||0)),elementUnlockXp:Math.max(0,Math.min(500,Number(input.elementUnlockXp)||0))}}
      else if(input.kind==='user'){const user=data.users.find(x=>x.username===String(input.username||'').toLowerCase());if(!user)return sendJson(res,404,{error:'Пользователь не найден.'});user.disabled=Boolean(input.disabled);if(user.disabled){user.sessions=[];for(const [token,session]of userSessions)if(session.userId===user.id)userSessions.delete(token)}}
      else if(input.kind==='mission'){const objectives=['elements','reactions','compounds','equations'];const mission={id:String(input.id||randomBytes(8).toString('hex')).replace(/[^a-z0-9_-]/gi,'').slice(0,40),title:String(input.title||'').trim().slice(0,80),description:String(input.description||'').trim().slice(0,240),objective:objectives.includes(input.objective)?input.objective:'elements',target:Math.max(1,Math.min(10000,Number(input.target)||1)),reward:Math.max(0,Math.min(1000,Number(input.reward)||0))};if(!mission.title)return sendJson(res,400,{error:'Укажи название миссии.'});data.missions=[...data.missions.filter(x=>x.id!==mission.id),mission]}
      else if(input.kind==='achievement'){const objectives=['elements','reactions','compounds','equations'];const achievement={id:String(input.id||randomBytes(8).toString('hex')).replace(/[^a-z0-9_-]/gi,'').slice(0,40),title:String(input.title||'').trim().slice(0,80),description:String(input.description||'').trim().slice(0,240),objective:objectives.includes(input.objective)?input.objective:'elements',target:Math.max(1,Math.min(10000,Number(input.target)||1))};if(!achievement.title)return sendJson(res,400,{error:'Укажи название достижения.'});data.achievements=[...data.achievements.filter(x=>x.id!==achievement.id),achievement]}
      else if(input.kind==='question'){const type=questionTypes.includes(input.type)?input.type:'',element=elements.find(x=>x.num===Number(input.element)),prompt=String(input.prompt||'').trim().slice(0,240),answer=String(input.answer||'').trim().slice(0,80),options=Array.isArray(input.options)?input.options.map(x=>String(x).slice(0,80)).slice(0,6):[];if(!type||!element||!prompt||!answer||(options.length>0&&!options.includes(answer)))return sendJson(res,400,{error:'Укажи элемент, тип, вопрос и правильный ответ. Если добавлены варианты, правильный ответ должен быть среди них.'});const question={element:element.num,type,prompt,answer,options,explanation:String(input.explanation||'').slice(0,400)};data.questions=[...data.questions.filter(x=>!(x.element===question.element&&x.type===question.type)),question]}
      else return sendJson(res,400,{error:'Неизвестный тип содержимого.'});await writeDatabase(data);return sendJson(res,200,{missions:data.missions,questions:data.questions});
    }
    if (url.pathname === '/api/wall' && req.method === 'GET') {
      const data = await readDatabase();
      return sendJson(res, 200, { posts: data.wall || [] });
    }
    if (url.pathname === '/api/wall' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let input;
      try { input = JSON.parse(body); } catch { return sendJson(res, 400, { error: 'Некорректные данные.' }); }
      const text = String(input.text || '').trim();
      const author = String(input.author || 'АНОНИМ').trim().slice(0, 32) || 'АНОНИМ';
      if (!text || text.length > 500) return sendJson(res, 400, { error: 'Сообщение должно быть длиной от 1 до 500 символов.' });
      const data = await readDatabase();
      const post = { id: randomBytes(12).toString('hex'), text, author, tag: 'СТЕНА', date: new Date().toISOString(), likes: 0 };
      data.wall = [post, ...(data.wall || [])].slice(0, 1000);
      await writeDatabase(data);
      return sendJson(res, 201, { post });
    }
    const likeMatch = url.pathname.match(/^\/api\/wall\/([a-f0-9-]+)\/like$/);
    if (likeMatch && req.method === 'POST') {
      const data = await readDatabase();
      const post = (data.wall || []).find(item => item.id === likeMatch[1]);
      if (!post) return sendJson(res, 404, { error: 'Запись не найдена.' });
      post.likes = Math.max(0, Number(post.likes || 0) + (Number(url.searchParams.get('delta')) < 0 ? -1 : 1));
      await writeDatabase(data);
      return sendJson(res, 200, { likes: post.likes });
    }
    const deleteMatch = url.pathname.match(/^\/api\/wall\/([a-f0-9-]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      if (!isAdmin(req)) return sendJson(res, 401, { error: 'Нужен доступ автора.' });
      const data = await readDatabase();
      data.wall = (data.wall || []).filter(item => item.id !== deleteMatch[1]);
      await writeDatabase(data);
      return sendJson(res, 200, { deleted: true });
    }
    if (url.pathname === '/api/admin/session' && req.method === 'GET') {
      const token = sessionFrom(req);
      return sendJson(res, 200, { configured: Boolean(adminPassword), authenticated: Boolean(token && sessions.has(token)) });
    }
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let password = '';
      try { password = JSON.parse(body).password || ''; } catch {}
      if (!adminPassword) return sendJson(res, 503, { error: 'Задайте SS_ADMIN_PASSWORD в окружении сервера.' });
      const provided = Buffer.from(password);
      const expected = Buffer.from(adminPassword);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return sendJson(res, 401, { error: 'Неверный пароль.' });
      const token = randomBytes(32).toString('hex');
      sessions.add(token);
      return sendJson(res, 200, { authenticated: true }, `ss_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    }
    if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
      sessions.delete(sessionFrom(req));
      return sendJson(res, 200, { authenticated: false }, 'ss_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
    if (relative.startsWith('..') || relative.startsWith('.')) throw new Error('Invalid path');
    const body = await readFile(join(root, relative));
    res.writeHead(200, { 'Content-Type': mime[extname(relative)] || 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    console.error('[SINCE SPACE]', error);
    if (url?.pathname.startsWith('/api/')) return sendJson(res, 500, { error:error?.cause?.code==='EACCES'||error?.cause?.code==='EPERM'?'Нет доступа к файлу данных. Проверь права записи в папку проекта.':error?.message||'Внутренняя ошибка сервера.' });
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(Number(process.env.PORT || 5173), process.env.HOST || '0.0.0.0', () => console.log('SINCE SPACE: http://localhost:' + (process.env.PORT || 5173)));
