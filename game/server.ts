import { createState, addPlayer, startMission, step, sanitizeInput, EMPTY_INPUT, type State, type Role, type Input } from './engine';
type Env={DB:D1Database};
type RoomRow={code:string;state:string;version:number;updated:number;expires:number;owner:string};
type PlayerRow={room:string;id:string;slot:number;name:string;role:Role;token:string;input:string;seen:number};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>alphabet[v%alphabet.length]).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
function db(env:Env){if(!env.DB)throw new Error('Room storage unavailable');return env.DB;}
function cleanName(v:unknown){return typeof v==='string'?v.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,18)||'Пилот':'Пилот';}
function cleanRole(v:unknown):Role{return v==='medic'||v==='engineer'?v:'assault';}
async function readBody(request:Request){if(Number(request.headers.get('content-length')||0)>2048)throw new Error('Body too large');const text=await request.text();if(text.length>2048)throw new Error('Body too large');return JSON.parse(text) as Record<string,unknown>;}
async function hash(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');}
async function identity(request:Request){return hash(request.headers.get('oai-authenticated-user-id')||request.headers.get('oai-authenticated-user-email')||request.headers.get('cf-connecting-ip')||'guest');}

export async function handleGameRequest(request:Request,env:Env,ctx:{waitUntil(p:Promise<unknown>):void}):Promise<Response|null>{
 const url=new URL(request.url);if(!url.pathname.startsWith('/api/rooms')&&url.pathname!=='/api/socket')return null;
 const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==url.host)return json({error:'Источник запроса не разрешён.'},403);
 try{
  const database=db(env);
  if(url.pathname==='/api/socket')return socket(request,database,ctx);
  if(request.method!=='POST')return json({error:'Метод не поддерживается.'},405);
  let body:Record<string,unknown>;try{body=await readBody(request);}catch{return json({error:'Некорректный запрос.'},400);}
  const now=Date.now();const name=cleanName(body.name),role=cleanRole(body.role);
  if(url.pathname==='/api/rooms'){
   const owner=await identity(request);await database.prepare('DELETE FROM signal_rooms WHERE expires < ?').bind(now).run();
   const count=await database.prepare('SELECT COUNT(*) AS count FROM signal_rooms WHERE owner = ? AND created > ?').bind(owner,now-10*60*1000).first<{count:number}>();if((count?.count??0)>=8)return json({error:'Слишком много новых отрядов. Используйте созданный код или подождите несколько минут.'},429);
   const code=randomCode(),id=crypto.randomUUID(),secret=token();const state=createState(crypto.getRandomValues(new Uint32Array(1))[0],id,body.difficulty==='hard'?'hard':'normal');addPlayer(state,id,name,role,0);
   await database.batch([database.prepare('INSERT INTO signal_rooms (code,state,version,updated,created,expires,owner) VALUES (?,?,0,?,?,?,?)').bind(code,JSON.stringify(state),now,now,now+2*60*60*1000,owner),database.prepare('INSERT INTO signal_players (room,id,slot,name,role,token,input,seen) VALUES (?,?,0,?,?,?,?,?)').bind(code,id,name,role,secret,JSON.stringify(EMPTY_INPUT),now)]);
   return json({code,id,token:secret,slot:0,state});
  }
  const match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/join$/);if(!match)return json({error:'Комната не найдена.'},404);
  const code=match[1];const row=await database.prepare('SELECT * FROM signal_rooms WHERE code = ? AND expires > ?').bind(code,now).first<RoomRow>();if(!row)return json({error:'Отряд не найден или срок комнаты истёк. Проверьте код.'},404);
  if(typeof body.id==='string'&&typeof body.token==='string'){
   const old=await database.prepare('SELECT * FROM signal_players WHERE room = ? AND id = ? AND token = ?').bind(code,body.id,body.token).first<PlayerRow>();if(old){await database.prepare('UPDATE signal_players SET seen = ? WHERE room = ? AND id = ?').bind(now,code,old.id).run();return json({code,id:old.id,token:old.token,slot:old.slot,state:JSON.parse(row.state)});}
  }
  await database.prepare('DELETE FROM signal_players WHERE room = ? AND seen < ?').bind(code,now-120000).run();
  const state=JSON.parse(row.state) as State;if(state.phase==='won'||state.phase==='lost')return json({error:'Эта экспедиция завершена. Попросите командира начать новую.'},409);
  const id=crypto.randomUUID(),secret=token();
  for(let slot=0;slot<4;slot++){
   const inserted=await database.prepare('INSERT OR IGNORE INTO signal_players (room,id,slot,name,role,token,input,seen) VALUES (?,?,?,?,?,?,?,?)').bind(code,id,slot,name,role,secret,JSON.stringify(EMPTY_INPUT),now).run();
   if(inserted.meta.changes)return json({code,id,token:secret,slot,state});
  }
  return json({error:'Отряд заполнен: максимум 4 игрока.'},409);
 }catch(error){console.error('Game service:',error);return json({error:'Не удалось связаться со станцией. Попробуйте ещё раз.'},503);}
}
function socket(request:Request,database:D1Database,ctx:{waitUntil(p:Promise<unknown>):void}):Response{
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'Требуется WebSocket.'},426);
 const code=new URL(request.url).searchParams.get('room')??'';if(!/^[A-Z2-9]{6}$/.test(code))return json({error:'Неверный код отряда.'},400);
 const pair=new WebSocketPair();const [client,server]=Object.values(pair);server.accept();
 let player:PlayerRow|null=null,busy=false,closed=false,lastMessage=0,messages=0,windowStart=Date.now(),latest=EMPTY_INPUT;
 const send=(data:unknown)=>{if(!closed)try{server.send(JSON.stringify(data));}catch{closed=true;}};
 const close=(reason:string)=>{if(!closed){send({type:'error',error:reason});closed=true;try{server.close(1008,reason);}catch{}}};
 const authDeadline=setTimeout(()=>{if(!player)close('Время входа истекло.');},10000);
 server.addEventListener('message',event=>{
  if(typeof event.data!=='string'||event.data.length>2048){close('Слишком большое сообщение.');return;}
  const now=Date.now();if(now-windowStart>1000){windowStart=now;messages=0;}if(++messages>40){close('Слишком много сообщений.');return;}
  let msg:Record<string,unknown>;try{msg=JSON.parse(event.data);}catch{send({type:'error',error:'Неверное сообщение.'});return;}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)){send({type:'error',error:'Неверное сообщение.'});return;}
  if(msg.type==='input')latest=sanitizeInput(msg.input);
  if(busy||closed)return;busy=true;
  ctx.waitUntil((async()=>{
   try{
    if(!player){
     if(msg.type!=='auth'||typeof msg.id!=='string'||typeof msg.token!=='string'){close('Нужен вход в отряд.');return;}
     player=await database.prepare('SELECT p.* FROM signal_players p JOIN signal_rooms r ON r.code = p.room WHERE p.room = ? AND p.id = ? AND p.token = ? AND r.expires > ?').bind(code,msg.id,msg.token,now).first<PlayerRow>();if(!player){close('Сессия не найдена. Войдите по коду ещё раз.');return;}clearTimeout(authDeadline);send({type:'ready',id:player.id});
    }
    if(msg.type==='leave'){await database.prepare('DELETE FROM signal_players WHERE room = ? AND id = ? AND token = ?').bind(code,player.id,player.token).run();closed=true;server.close(1000,'Вы вышли из отряда.');return;}
    if(msg.type!=='auth'&&msg.type!=='input'&&msg.type!=='start'&&msg.type!=='restart'&&msg.type!=='ping')return;
    if(msg.type==='input'&&now-lastMessage<65)return;lastMessage=now;
    const result=await database.batch([
     database.prepare('UPDATE signal_players SET input = ?, seen = ? WHERE room = ? AND id = ? AND token = ?').bind(JSON.stringify(latest),now,code,player.id,player.token),
     database.prepare('SELECT * FROM signal_rooms WHERE code = ? AND expires > ?').bind(code,now),
     database.prepare('SELECT * FROM signal_players WHERE room = ? ORDER BY slot').bind(code),
    ]);
    const row=result[1].results[0] as unknown as RoomRow|undefined;if(!row){close('Срок комнаты истёк.');return;}
    const roster=result[2].results as unknown as PlayerRow[];
    if(!roster.some(p=>p.id===player!.id)){close('Вы вышли из отряда.');return;}
    let state=JSON.parse(row.state) as State;const elapsed=now-row.updated;
    if(elapsed>=80||msg.type==='start'||msg.type==='restart'||msg.type==='auth'){
     if(!roster.some(p=>p.id===state.host&&now-p.seen<12000))state.host=roster.find(p=>now-p.seen<12000)?.id??state.host;
     if(msg.type==='restart'&&player.id===state.host&&(state.phase==='won'||state.phase==='lost'))state=createState(crypto.getRandomValues(new Uint32Array(1))[0],state.host,state.difficulty);
     const inputs:Record<string,Input>={};for(const p of roster){const entity=addPlayer(state,p.id,p.name,p.role,p.slot);entity.connected=now-p.seen<12000;inputs[p.id]=now-p.seen<900?sanitizeInput(JSON.parse(p.input)):EMPTY_INPUT;}
     state.players=state.players.filter(p=>roster.some(r=>r.id===p.id));
     if(msg.type==='start'&&player.id===state.host)startMission(state);
     // Bounded fixed substeps, committed atomically by revision. Any connection may advance the room.
     let remaining=Math.max(.001,Math.min(elapsed/1000,.25));while(remaining>0){const dt=Math.min(1/60,remaining);step(state,inputs,dt);remaining-=dt;}
     const written=await database.prepare('UPDATE signal_rooms SET state = ?, version = version + 1, updated = ? WHERE code = ? AND version = ?').bind(JSON.stringify(state),now,code,row.version).run();
     if(!written.meta.changes){const current=await database.prepare('SELECT state FROM signal_rooms WHERE code = ?').bind(code).first<{state:string}>();if(current)state=JSON.parse(current.state);}
    }
    send({type:'state',state,echo:msg.time??now,serverTime:now});
   }catch(error){console.error('Room connection:',error);send({type:'error',error:'Станция временно не отвечает. Восстанавливаем связь…'});}
   finally{busy=false;}
  })());
 });
 server.addEventListener('close',()=>{closed=true;clearTimeout(authDeadline);});server.addEventListener('error',()=>{closed=true;clearTimeout(authDeadline);});
 return new Response(null,{status:101,webSocket:client});
}
