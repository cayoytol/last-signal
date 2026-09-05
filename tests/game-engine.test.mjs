import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'signal-engine-'));
await build({entryPoints:['game/engine.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'engine.mjs')});
const E=await import(pathToFileURL(join(temp,'engine.mjs')).href);
const input=(v={})=>({...E.EMPTY_INPUT,...v});
function world(players=1){const s=E.createState(55,'p0');for(let i=0;i<players;i++)E.addPlayer(s,'p'+i,'Pilot '+i,'engineer',i);E.startMission(s);return s;}
function run(s,ins,seconds){for(let i=0;i<Math.ceil(seconds*60);i++)E.step(s,ins,1/60);}
test('malicious and diagonal inputs cannot exceed the movement envelope',()=>{const i=E.sanitizeInput({x:999,z:999,aim:Infinity,seq:-1,fire:'yes'});assert.ok(Math.hypot(i.x,i.z)<=1.00001);assert.equal(i.aim,0);assert.equal(i.fire,false);assert.equal(i.seq,0);const s=world();s.players[0].x=20;s.players[0].z=0;run(s,{p0:i},2);assert.ok(s.players[0].x<=21.62);});
test('simulation is deterministic for the same seed and intent',()=>{const a=world(),b=world();run(a,{p0:input({fire:true,aim:0})},12);run(b,{p0:input({fire:true,aim:0})},12);assert.deepEqual(a,b);});
test('rifle kills enemy, credits owner, and consumes ammo',()=>{const s=world();const p=s.players[0];p.x=-12;p.z=0;s.enemies=[{id:700,kind:'scout',x:-8,z:0,hp:48,maxHp:48,angle:0,cd:9,flash:0}];s.spawn=100;run(s,{p0:input({fire:true,aim:0})},.6);assert.equal(p.kills,1);assert.equal(s.enemies.length,0);assert.ok(p.ammo<24);});
test('friendly fire does not damage teammates',()=>{const s=world(2);s.players[0].x=-12;s.players[0].z=0;s.players[1].x=-9;s.players[1].z=0;s.spawn=100;run(s,{p0:input({fire:true,aim:0})},1);assert.equal(s.players[1].hp,100);});
test('wall collision prevents walking through reactor or dashing outside the station',()=>{const s=world();const p=s.players[0];p.x=0;p.z=4;s.spawn=100;run(s,{p0:input({z:-1,dash:true})},1);assert.ok(p.z>=2.68-1e-8);p.x=21;p.z=0;run(s,{p0:input({x:1,dash:true})},1);assert.ok(p.x<=21.62);});
test('two engineers repair faster and cannot repair from across the arena',()=>{const s=world(2);const r=s.relays[0];for(const p of s.players){p.x=r.x;p.z=r.z;}s.spawn=100;run(s,{p0:input({interact:true}),p1:input({interact:true})},1);assert.ok(r.charge>17&&r.charge<19);s.players.forEach(p=>{p.x=0;p.z=7;});const c=r.charge;run(s,{p0:input({interact:true}),p1:input({interact:true})},1);assert.equal(r.charge,c);});
test('medic can revive a downed teammate at close range',()=>{const s=world(2);s.players[0].role='medic';s.players[1].x=s.players[0].x+.8;s.players[1].z=s.players[0].z;s.players[1].hp=0;s.players[1].down=24;s.spawn=100;run(s,{p0:input({interact:true})},2);assert.equal(s.players[1].hp,55);assert.equal(s.players[1].down,0);});
test('extraction requires all surviving connected players inside the zone',()=>{const s=world(2);s.relays.forEach(r=>{r.active=true;r.charge=100;});s.spawn=100;run(s,{},.1);assert.equal(s.phase,'extract');s.extraction=0;s.players[0].x=0;s.players[0].z=-13;run(s,{},4);assert.equal(s.phase,'extract');s.players[1].x=1;s.players[1].z=-13;run(s,{},3.1);assert.equal(s.phase,'won');});
test('destroyed reactor and squad wipe both produce a loss',()=>{const a=world();a.core=0;E.step(a,{},1/60);assert.equal(a.phase,'lost');const b=world();b.players[0].hp=0;E.step(b,{},1/60);assert.equal(b.phase,'lost');});
test('reload and skill cooldown cannot be spammed',()=>{const s=world();const p=s.players[0];p.ammo=0;s.spawn=100;run(s,{p0:input({fire:true,reload:true,skill:true})},.5);assert.equal(p.ammo,0);assert.ok(p.reload>0);assert.ok(p.skillCd>17);run(s,{p0:input()},1);assert.equal(p.ammo,24);});
