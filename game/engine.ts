/** Pure deterministic simulation. The online client submits intent, never positions or damage. */
export type Role = 'assault' | 'medic' | 'engineer';
export type Phase = 'lobby' | 'active' | 'extract' | 'won' | 'lost';
export type Input = { x:number; z:number; aim:number; fire:boolean; interact:boolean; dash:boolean; reload:boolean; skill:boolean; seq:number };
export type Player = { id:string; name:string; role:Role; slot:number; x:number; z:number; angle:number; hp:number; ammo:number; reload:number; cooldown:number; dashCd:number; dashTime:number; skillCd:number; buff:number; down:number; revive:number; kills:number; damage:number; repairs:number; connected:boolean; ack:number; };
export type Enemy = { id:number; kind:'scout'|'brute'|'spitter'; x:number; z:number; hp:number; maxHp:number; angle:number; cd:number; flash:number; };
export type Bolt = { id:number; x:number; z:number; vx:number; vz:number; life:number; owner:string; enemy:boolean; damage:number };
export type Event = { id:number; kind:'shot'|'hit'|'kill'|'dash'|'heal'|'relay'|'alarm'|'revive'|'skill'; x:number; z:number; value?:number; owner?:string };
export type Relay = { x:number; z:number; charge:number; active:boolean; label:string };
export type Pickup = { id:number; x:number; z:number; life:number };
export type State = { version:number; phase:Phase; t:number; seed:number; serial:number; players:Player[]; enemies:Enemy[]; bolts:Bolt[]; events:Event[]; relays:Relay[]; pickups:Pickup[]; core:number; wave:number; spawn:number; extraction:number; extractHold:number; result:string; host:string; difficulty:'normal'|'hard'; };
export const COLORS=['#b6f06b','#65dfea','#efb35b','#c9a5ff'];
export const ROLE_NAMES:Record<Role,string>={assault:'Штурмовик',medic:'Медик',engineer:'Инженер'};
export const BOUNDS={x:22,z:17};
export const EXTRACTION={x:0,z:-13};
export const OBSTACLES=[
 {x:-8,z:-5,w:3.8,d:1.8,h:1.3},{x:8,z:-5,w:3.8,d:1.8,h:1.3},
 {x:-8,z:6,w:2.2,d:4.2,h:1.5},{x:8,z:6,w:2.2,d:4.2,h:1.5},
 {x:-17,z:3,w:2.5,d:3,h:1.2},{x:17,z:3,w:2.5,d:3,h:1.2},
 {x:-12,z:-13,w:2.5,d:1.4,h:1},{x:12,z:-13,w:2.5,d:1.4,h:1},
 {x:-15,z:12,w:3.4,d:1.4,h:1.2},{x:15,z:12,w:3.4,d:1.4,h:1.2},
 {x:0,z:0,w:4.6,d:4.6,h:2.2},
];
export const EMPTY_INPUT:Input={x:0,z:0,aim:-Math.PI/2,fire:false,interact:false,dash:false,reload:false,skill:false,seq:0};
export function sanitizeInput(raw:unknown):Input {
 const v=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
 const n=(k:string,min:number,max:number)=>typeof v[k]==='number'&&Number.isFinite(v[k])?Math.max(min,Math.min(max,v[k] as number)):0;
 let x=n('x',-1,1),z=n('z',-1,1); const l=Math.hypot(x,z);if(l>1){x/=l;z/=l;}
 return {x,z,aim:n('aim',-Math.PI*4,Math.PI*4),fire:v.fire===true,interact:v.interact===true,dash:v.dash===true,reload:v.reload===true,skill:v.skill===true,seq:Math.floor(n('seq',0,1e9))};
}
export function createState(seed=1234,host='',difficulty:'normal'|'hard'='normal'):State {
 return {version:0,phase:'lobby',t:0,seed:seed>>>0,serial:0,players:[],enemies:[],bolts:[],events:[],relays:[{x:-16,z:-8,charge:0,active:false,label:'01'},{x:16,z:-8,charge:0,active:false,label:'02'},{x:0,z:12,charge:0,active:false,label:'03'}],pickups:[],core:100,wave:1,spawn:2.5,extraction:32,extractHold:0,result:'',host,difficulty};
}
export function addPlayer(s:State,id:string,name:string,role:Role,slot:number):Player {
 const old=s.players.find(p=>p.id===id);if(old){old.connected=true;return old;}
 const p:Player={id,name:name.slice(0,18),role,slot,x:(slot-1.5)*1.6,z:7,angle:-Math.PI/2,hp:100,ammo:24,reload:0,cooldown:0,dashCd:0,dashTime:0,skillCd:0,buff:0,down:0,revive:0,kills:0,damage:0,repairs:0,connected:true,ack:0};s.players.push(p);return p;
}
export function startMission(s:State){if(s.players.length&&s.phase==='lobby'){s.phase='active';s.spawn=3;}}
function random(s:State){s.seed=(Math.imul(1664525,s.seed)+1013904223)>>>0;return s.seed/4294967296;}
function emit(s:State,kind:Event['kind'],x:number,z:number,value?:number,owner?:string){s.events.push({id:++s.serial,kind,x,z,value,owner});}
export function blocked(x:number,z:number,r=.38){return Math.abs(x)>BOUNDS.x-r||Math.abs(z)>BOUNDS.z-r||OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);}
export function move(p:{x:number;z:number},dx:number,dz:number,r=.38){const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.25));for(let i=0;i<steps;i++){if(!blocked(p.x+dx/steps,p.z,r))p.x+=dx/steps;if(!blocked(p.x,p.z+dz/steps,r))p.z+=dz/steps;}}
function hitPlayer(s:State,p:Player,damage:number){if(p.hp<=0||p.dashTime>0)return;p.hp=Math.max(0,p.hp-damage);emit(s,'hit',p.x,p.z,damage,p.id);if(p.hp===0){p.down=24;emit(s,'alarm',p.x,p.z,0,p.id);}}
function hurtEnemy(s:State,e:Enemy,damage:number,owner:string){if(e.hp<=0)return;e.hp-=damage;e.flash=.13;const p=s.players.find(p=>p.id===owner);if(p)p.damage+=damage;emit(s,'hit',e.x,e.z,damage,owner);if(e.hp<=0){if(p)p.kills++;emit(s,'kill',e.x,e.z,0,owner);if(random(s)<.18)s.pickups.push({id:++s.serial,x:e.x,z:e.z,life:18});}}
function spawnEnemy(s:State){if(s.enemies.length>=38)return;const side=Math.floor(random(s)*4),v=random(s);let x=side<2?(side===0?-20.8:20.8):-19+v*38;let z=side<2?-15+v*30:(side===2?-15.8:15.8);if(blocked(x,z,.6)){x=side===0?-20:20;z=0;}const roll=random(s),kind=s.wave>=3&&roll<.2?'brute':s.wave>=2&&roll<.4?'spitter':'scout';const maxHp=kind==='brute'?160:kind==='spitter'?55:48;s.enemies.push({id:++s.serial,kind,x,z,hp:maxHp,maxHp,angle:0,cd:1.2,flash:0});}
export function contextAction(s:State,p:Player|undefined):string {
 if(!p)return '';if(p.hp<=0)return p.down>0?'Вы ранены · дождитесь помощи':'';
 const down=s.players.find(q=>q.id!==p.id&&q.hp<=0&&q.down>0&&Math.hypot(q.x-p.x,q.z-p.z)<2.4);if(down)return `Удерживайте E · поднять ${down.name}`;
 const relay=s.relays.find(r=>!r.active&&Math.hypot(r.x-p.x,r.z-p.z)<2.8);if(relay)return `Удерживайте E · восстановить модуль ${relay.label}`;
 if(s.phase==='extract'&&s.extraction<=0&&Math.hypot(p.x-EXTRACTION.x,p.z-EXTRACTION.z)<3)return 'Зона эвакуации · дождитесь отряда';
 return '';
}
export function step(s:State,inputs:Record<string,Input>,dt:number){
 dt=Math.max(0,Math.min(.12,dt));s.version++;s.events=s.events.slice(-55);
 if(s.phase!=='active'&&s.phase!=='extract')return;
 s.t+=dt;const live=s.players.filter(p=>p.connected&&p.hp>0);
 for(const p of s.players){
  p.cooldown=Math.max(0,p.cooldown-dt);p.dashCd=Math.max(0,p.dashCd-dt);p.dashTime=Math.max(0,p.dashTime-dt);p.skillCd=Math.max(0,p.skillCd-dt);p.buff=Math.max(0,p.buff-dt);
  if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(!p.reload)p.ammo=24;}
  if(p.hp<=0){p.down=Math.max(0,p.down-dt);continue;}if(!p.connected)continue;
  const i=inputs[p.id]??EMPTY_INPUT;p.ack=i.seq;p.angle=i.aim;
  if(i.reload&&p.ammo<24&&!p.reload)p.reload=1.35;
  if(i.dash&&p.dashCd===0){p.dashCd=3.2;p.dashTime=.17;emit(s,'dash',p.x,p.z,0,p.id);}
  const vel=p.dashTime>0?20:6.2;
  let mx=i.x,mz=i.z;if(p.dashTime>0&&Math.hypot(mx,mz)<.1){mx=Math.cos(p.angle);mz=Math.sin(p.angle);}
  move(p,mx*vel*dt,mz*vel*dt);
  if(i.skill&&p.skillCd===0){p.skillCd=p.role==='medic'?22:18;emit(s,'skill',p.x,p.z,0,p.id);
   if(p.role==='medic'){for(const q of s.players)if(q.hp>0&&Math.hypot(q.x-p.x,q.z-p.z)<8)q.hp=Math.min(100,q.hp+42);emit(s,'heal',p.x,p.z,42,p.id);}
   else if(p.role==='engineer'){for(const e of s.enemies)if(Math.hypot(e.x-p.x,e.z-p.z)<6)hurtEnemy(s,e,75,p.id);if(Math.hypot(p.x,p.z)<6)s.core=Math.min(100,s.core+8);}
   else p.buff=5;
  }
  if(i.fire&&!p.reload&&p.cooldown===0){if(p.ammo===0)p.reload=1.35;else{
   p.ammo--;p.cooldown=(p.role==='assault'?.145:.185)/(p.buff>0?1.8:1);const spread=(random(s)-.5)*.045,a=p.angle+spread;
   s.bolts.push({id:++s.serial,x:p.x+Math.cos(a)*.65,z:p.z+Math.sin(a)*.65,vx:Math.cos(a)*36,vz:Math.sin(a)*36,life:.72,owner:p.id,enemy:false,damage:24});emit(s,'shot',p.x,p.z,a,p.id);
  }}
  if(i.interact){const q=s.players.find(q=>q.id!==p.id&&q.hp<=0&&q.down>0&&Math.hypot(q.x-p.x,q.z-p.z)<2.4);if(q){q.revive+=dt/(p.role==='medic'?1.6:2.8);if(q.revive>=1){q.hp=55;q.down=0;q.revive=0;emit(s,'revive',q.x,q.z,0,p.id);}}
   else{const r=s.relays.find(r=>!r.active&&Math.hypot(r.x-p.x,r.z-p.z)<2.8);if(r){const charge=dt*(p.role==='engineer'?9:6);r.charge=Math.min(100,r.charge+charge);p.repairs+=charge;if(r.charge>=100){r.active=true;s.core=Math.min(100,s.core+12);emit(s,'relay',r.x,r.z,0,p.id);for(const q of s.players)if(q.hp>0)q.hp=Math.min(100,q.hp+18);}}}
  }
 }
 const completed=s.relays.filter(r=>r.active).length;s.wave=1+completed+Math.floor(s.t/55);
 if(completed===3&&s.phase==='active'){s.phase='extract';s.extraction=32;emit(s,'alarm',0,-13,1);}
 if(s.phase==='extract'){s.extraction=Math.max(0,s.extraction-dt);if(s.extraction===0){const alive=s.players.filter(p=>p.connected&&p.hp>0);const all=alive.length>0&&alive.every(p=>Math.hypot(p.x-EXTRACTION.x,p.z-EXTRACTION.z)<3.2);s.extractHold=all?s.extractHold+dt:0;if(s.extractHold>=3){s.phase='won';s.result='Сигнал восстановлен. Отряд эвакуирован.';return;}}}
 s.spawn-=dt;const difficulty=s.difficulty==='hard'?1.35:1;
 if(s.spawn<=0){spawnEnemy(s);s.spawn=Math.max(.6,2.7-s.wave*.3)/Math.max(1,Math.sqrt(live.length))*1/difficulty;}
 for(const e of s.enemies){if(e.hp<=0)continue;e.cd=Math.max(0,e.cd-dt);e.flash=Math.max(0,e.flash-dt);
  let target:{x:number;z:number;id?:string}={x:0,z:0};let min=12;for(const p of live){const d=Math.hypot(p.x-e.x,p.z-e.z);if(d<min){min=d;target=p;}}
  const dx=target.x-e.x,dz=target.z-e.z,d=Math.hypot(dx,dz);e.angle=Math.atan2(dz,dx);
  const range=e.kind==='spitter'&&target.id?9:target.id?1:3;
  if(d>range){const speed=(e.kind==='brute'?1.4:e.kind==='spitter'?2:2.8)*difficulty;const ox=e.x,oz=e.z;move(e,dx/d*speed*dt,dz/d*speed*dt,e.kind==='brute'?.6:.4);
   // Slide around crates deterministically instead of getting stuck at their centres.
   if(Math.hypot(e.x-ox,e.z-oz)<speed*dt*.25)move(e,-dz/d*speed*dt,dx/d*speed*dt,e.kind==='brute'?.6:.4);
  }else if(!e.cd){e.cd=e.kind==='spitter'?1.7:e.kind==='brute'?1.1:.8;
   if(e.kind==='spitter'&&target.id){s.bolts.push({id:++s.serial,x:e.x,z:e.z,vx:dx/d*10,vz:dz/d*10,life:1.6,owner:'enemy',enemy:true,damage:12*difficulty});}
   else if(target.id){const p=s.players.find(p=>p.id===target.id);if(p)hitPlayer(s,p,(e.kind==='brute'?19:9)*difficulty);}
   else{s.core=Math.max(0,s.core-(e.kind==='brute'?3:1.1)*difficulty);emit(s,'hit',0,0,1);}
  }
 }
 for(const b of s.bolts){const n=Math.ceil(dt*45/.35);for(let j=0;j<n&&b.life>0;j++){b.x+=b.vx*dt/n;b.z+=b.vz*dt/n;b.life-=dt/n;if(blocked(b.x,b.z,.08)){b.life=0;break;}if(b.enemy){for(const p of live)if(Math.hypot(p.x-b.x,p.z-b.z)<.52){hitPlayer(s,p,b.damage);b.life=0;break;}}
 else{for(const e of s.enemies)if(e.hp>0&&Math.hypot(e.x-b.x,e.z-b.z)<(e.kind==='brute'?.85:.6)){hurtEnemy(s,e,b.damage,b.owner);b.life=0;break;}}}}
 s.bolts=s.bolts.filter(b=>b.life>0).slice(-120);s.enemies=s.enemies.filter(e=>e.hp>0);
 for(const drop of s.pickups){drop.life-=dt;const p=live.find(p=>Math.hypot(p.x-drop.x,p.z-drop.z)<1.1);if(p){p.hp=Math.min(100,p.hp+22);drop.life=0;emit(s,'heal',p.x,p.z,22,p.id);}}s.pickups=s.pickups.filter(d=>d.life>0);
 if(s.core<=0){s.phase='lost';s.result='Реактор разрушен. Сигнал потерян.';}
 else if(s.players.some(p=>p.connected)&&s.players.filter(p=>p.connected).every(p=>p.hp<=0)){s.phase='lost';s.result='Весь отряд выведен из строя.';}
 else if(s.t>900){s.phase='lost';s.result='Орбита станции стала нестабильной.';}
 s.events=s.events.slice(-55);
}
export function snapshot(s:State):State{return JSON.parse(JSON.stringify(s));}
