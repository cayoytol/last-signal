import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import { mkdtemp,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'signal-server-'));
await build({entryPoints:['game/server.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'server.mjs')});
const {handleGameRequest}=await import(pathToFileURL(join(temp,'server.mjs')).href);
const NativeResponse=globalThis.Response;
class CFResponse extends NativeResponse{constructor(body,init={}){super(body,{...init,status:init.status===101?200:init.status});this.ws=init.webSocket;this.upgraded=init.status===101;}get status(){return this.upgraded?101:super.status;}}
globalThis.Response=CFResponse;
class Socket extends EventTarget{sent=[];closed=false;accept(){}send(raw){this.sent.push(JSON.parse(raw));}close(){this.closed=true;}receive(message){const e=new Event('message');Object.defineProperty(e,'data',{value:typeof message==='string'?message:JSON.stringify(message)});this.dispatchEvent(e);}}
let latestPair;
globalThis.WebSocketPair=class{constructor(){this[0]=new Socket();this[1]=new Socket();latestPair=this;}};
function database(){const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');return{raw,prepare(sql){let args=[];const self={bind(...v){args=v;return self;},async first(){return raw.prepare(sql).get(...args)||null;},async all(){return{results:raw.prepare(sql).all(...args),meta:{changes:0}};},async run(){const r=raw.prepare(sql).run(...args);return{results:[],meta:{changes:Number(r.changes)}};},_exec(){if(/^\s*SELECT/i.test(sql))return{results:raw.prepare(sql).all(...args),meta:{changes:0}};const r=raw.prepare(sql).run(...args);return{results:[],meta:{changes:Number(r.changes)}};}};return self;},async batch(statements){raw.exec('BEGIN');try{const r=statements.map(s=>s._exec());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};}
const ctx={tasks:[],waitUntil(p){this.tasks.push(p);},async drain(){while(this.tasks.length)await Promise.all(this.tasks.splice(0));}};
async function api(env,path,body){const r=await handleGameRequest(new Request('https://game.test'+path,{method:'POST',headers:{'content-type':'application/json','origin':'https://game.test'},body:JSON.stringify(body)}),env,ctx);return{status:r.status,...await r.json()};}
async function connect(env,s){const r=await handleGameRequest(new Request('https://game.test/api/socket?room='+s.code,{headers:{Upgrade:'websocket',origin:'https://game.test'}}),env,ctx);assert.equal(r.status,101);const server=latestPair[1];server.receive({type:'auth',id:s.id,token:s.token});await ctx.drain();assert.equal(server.sent[0].type,'ready');return server;}
async function message(s,m){s.receive(m);await ctx.drain();return s.sent.filter(v=>v.type==='state').at(-1)?.state;}
const migration=await readFile('drizzle/0000_purple_rawhide_kid.sql','utf8');
test('two WebSocket sessions share a mission, owner controls launch, reconnect keeps player and invalid token is rejected',async()=>{
 const env={DB:database()};env.DB.raw.exec(migration);const a=await api(env,'/api/rooms',{name:'Alpha',role:'engineer'});assert.equal(a.status,200);const b=await api(env,`/api/rooms/${a.code}/join`,{name:'Bravo',role:'medic'});assert.equal(b.status,200);assert.notEqual(a.id,b.id);
 const sa=await connect(env,a),sb=await connect(env,b);let state=await message(sb,{type:'start'});assert.equal(state.phase,'lobby');state=await message(sa,{type:'start'});assert.equal(state.phase,'active');assert.equal(state.players.length,2);
 env.DB.raw.exec('UPDATE signal_rooms SET updated=updated-150');const seen=await message(sb,{type:'ping'});assert.equal(seen.phase,'active');assert.deepEqual(seen.players.map(p=>p.id),state.players.map(p=>p.id));
 const back=await api(env,`/api/rooms/${a.code}/join`,{id:b.id,token:b.token,name:'ignored'});assert.equal(back.id,b.id);assert.equal(back.token,b.token);
 await handleGameRequest(new Request('https://game.test/api/socket?room='+a.code,{headers:{Upgrade:'websocket'}}),env,ctx);const bad=latestPair[1];await message(bad,{type:'auth',id:b.id,token:'invalid'});assert.equal(bad.closed,true);
 sa.dispatchEvent(new Event('close'));sb.dispatchEvent(new Event('close'));bad.dispatchEvent(new Event('close'));env.DB.raw.close();
});
test('concurrent joins cannot exceed four occupied slots',async()=>{const env={DB:database()};env.DB.raw.exec(migration);const a=await api(env,'/api/rooms',{name:'Host'});const joined=await Promise.all(Array.from({length:6},(_,i)=>api(env,`/api/rooms/${a.code}/join`,{name:'Pilot '+i})));assert.equal(joined.filter(r=>r.status===200).length,3);assert.equal(joined.filter(r=>r.status===409).length,3);const rows=env.DB.raw.prepare('SELECT COUNT(*) AS n FROM signal_players').get();assert.equal(rows.n,4);env.DB.raw.close();});
test('cross-origin and malformed room requests are refused',async()=>{const env={DB:database()};env.DB.raw.exec(migration);const r=await handleGameRequest(new Request('https://game.test/api/rooms',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}),env,ctx);assert.equal(r.status,403);const bad=await api(env,'/api/rooms/XX/join',{});assert.equal(bad.status,404);env.DB.raw.close();});
