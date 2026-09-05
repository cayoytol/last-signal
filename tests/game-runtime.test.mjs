import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare,Log,LogLevel } from 'miniflare';
import { readFile } from 'node:fs/promises';
const bundled=await build({stdin:{contents:'import {handleGameRequest} from "./game/server.ts"; export default {fetch:(r,e,c)=>handleGameRequest(r,e,c)};',resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',write:false});
async function packet(ws,value,kind='state'){
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.removeEventListener('message',listener);reject(new Error('Timed out awaiting '+kind));},7000);const listener=e=>{const m=JSON.parse(e.data);if(m.type==='error'){clearTimeout(timer);ws.removeEventListener('message',listener);reject(new Error(m.error));}if(m.type===kind){clearTimeout(timer);ws.removeEventListener('message',listener);resolve(m);}};ws.addEventListener('message',listener);ws.send(JSON.stringify(value));});
}
test('actual Worker runtime upgrades two WebSockets and commits one shared mission to D1',async()=>{
 const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-01',d1Databases:{DB:'signal-test'},cf:false,log:new Log(LogLevel.ERROR)});const sockets=[];
 try{
  const db=await mf.getD1Database('DB');const sql=await readFile('drizzle/0000_purple_rawhide_kid.sql','utf8');for(const part of sql.split('--> statement-breakpoint'))if(part.trim())await db.prepare(part.trim()).run();
  const api=async(path,body)=>{const r=await mf.dispatchFetch('http://game.test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  const a=await api('/api/rooms',{name:'Host'}),b=await api('/api/rooms/'+a.code+'/join',{name:'Partner'});
  for(const session of [a,b]){const response=await mf.dispatchFetch('http://game.test/api/socket?room='+a.code,{headers:{Upgrade:'websocket'}});assert.equal(response.status,101);const ws=response.webSocket;assert.ok(ws);ws.accept();sockets.push(ws);await packet(ws,{type:'auth',id:session.id,token:session.token});}
  const active=await packet(sockets[0],{type:'start'});assert.equal(active.state.phase,'active');assert.equal(active.state.players.length,2);
  const synced=await packet(sockets[1],{type:'ping'});assert.equal(synced.state.phase,'active');assert.deepEqual(synced.state.players.map(p=>p.id),active.state.players.map(p=>p.id));
  const row=await db.prepare('SELECT state FROM signal_rooms WHERE code = ?').bind(a.code).first();assert.equal(JSON.parse(row.state).phase,'active');
 }finally{for(const ws of sockets)ws.close();await mf.dispose();}
});
