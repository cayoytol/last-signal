import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BOUNDS, COLORS, OBSTACLES, EXTRACTION, type State, type Event } from './engine';

type Spark={mesh:THREE.Mesh;vx:number;vz:number;vy:number;life:number;max:number};
export class GameRenderer{
 renderer:THREE.WebGLRenderer;scene=new THREE.Scene();camera=new THREE.OrthographicCamera();composer:EffectComposer;bloom:UnrealBloomPass;
 canvas:HTMLCanvasElement;width=1;height=1;quality='high';menu=true;shake=0;time=0;
 players=new Map<string,THREE.Group>();enemies=new Map<number,THREE.Group>();bolts=new Map<number,THREE.Mesh>();drops=new Map<number,THREE.Group>();
 relays:THREE.Group[]=[];rings:THREE.Mesh[]=[];particles:Spark[]=[];eventCursor=0;extract:THREE.Group;coreLight:THREE.PointLight;
 ray=new THREE.Raycaster();plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.35);floorAim=new THREE.Vector3();observer:ResizeObserver;target=new THREE.Vector3(-13,0,0);
 materials=new Map<string,THREE.Material>();unitBox=new THREE.BoxGeometry(1,1,1);unitSphere=new THREE.IcosahedronGeometry(1,1);sparkGeo=new THREE.BoxGeometry(.065,.065,.065);dust:THREE.Points;lost=false;
 constructor(canvas:HTMLCanvasElement){
  this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.scene.background=new THREE.Color('#080e13');this.scene.fog=new THREE.FogExp2('#08131b',.009);
  this.scene.add(new THREE.HemisphereLight('#b8dbeb','#172b32',2.2));const sun=new THREE.DirectionalLight('#b9eaff',3.2);sun.position.set(-14,24,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-28;sun.shadow.camera.right=28;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;sun.shadow.normalBias=.08;this.scene.add(sun);
  const rim=new THREE.DirectionalLight('#60a9a7',2);rim.position.set(20,6,-25);this.scene.add(rim);
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.5,.5,.9);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
  this.makeStation();this.coreLight=new THREE.PointLight('#79e5e6',60,18,2);this.coreLight.position.set(0,4,0);this.scene.add(this.coreLight);this.extract=this.makeExtraction();this.scene.add(this.extract);
  const starGeo=new THREE.BufferGeometry(),starPos=new Float32Array(1800*3);let seed=119;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};for(let i=0;i<1800;i++){starPos[i*3]=(rand()-.5)*240;starPos[i*3+1]=-8-rand()*70;starPos[i*3+2]=(rand()-.5)*200;}starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));this.dust=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#9bccd9',size:.09,transparent:true,opacity:.55}));this.scene.add(this.dust);
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement!);this.resize();
 }
 mat(color:string,glow=false){const key=color+glow;if(!this.materials.has(key))this.materials.set(key,glow?new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:2.6,roughness:.35,metalness:.3}):new THREE.MeshStandardMaterial({color,roughness:.75,metalness:.45}));return this.materials.get(key)!;}
 box(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string,glow=false){const m=new THREE.Mesh(this.unitBox,this.mat(color,glow));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=!glow;m.receiveShadow=!glow;parent.add(m);return m;}
 cylinder(parent:THREE.Object3D,x:number,y:number,z:number,r:number,h:number,color:string,segments=8,glow=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),this.mat(color,glow));m.position.set(x,y,z);m.castShadow=!glow;m.receiveShadow=true;parent.add(m);return m;}
 ring(parent:THREE.Object3D,x:number,y:number,z:number,r:number,color:string,tube=.035){const m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,6,64),this.mat(color,true));m.rotation.x=Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;}
 label(parent:THREE.Object3D,text:string,x:number,y:number,z:number,size:number,color='#9bbbbc'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,512,128);ctx.fillStyle=color;ctx.font='700 66px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size/4),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);parent.add(m);return m;
 }
 makeStation(){
  const floor=new THREE.Group();this.scene.add(floor);this.box(floor,0,-.6,0,45,1.1,35,'#17252a');this.box(floor,0,-1.25,0,43,.3,33,'#10232a');
  const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(2.72,.12,2.72),new THREE.MeshStandardMaterial({color:'#42585e',roughness:.9,metalness:.5}),16*12);const dummy=new THREE.Object3D();let idx=0;for(let i=0;i<16;i++)for(let j=0;j<12;j++){dummy.position.set(-20.7+i*2.76,.02,-15.18+j*2.76);dummy.updateMatrix();tiles.setMatrixAt(idx,dummy.matrix);tiles.setColorAt(idx++,new THREE.Color((i+j)%3===0?'#334850':(i+j)%3===1?'#2a3d45':'#30444b'));}tiles.receiveShadow=true;floor.add(tiles);
  for(const side of [-1,1]){this.box(floor,side*22.35,.25,0,.35,.55,35,'#5d7378');this.box(floor,side*22.55,-.15,0,.08,.07,32,'#61c4cb',true);this.box(floor,0,.25,side*17.3,45,.55,.35,'#5d7378');this.box(floor,0,.55,side*17.25,42,.025,.035,'#72959b',true);
   for(let z=-15;z<=15;z+=5){this.box(floor,side*22.3,1,z,.45,1.6,.8,'#2b3f48');this.box(floor,side*22.25,1.4,z,.48,.1,.7,'#b6f06b',true);}
   for(let x=-20;x<=20;x+=4){this.box(floor,x,.105,side*16.2,1.8,.015,.16,'#ad995f');}
   for(let z=-13;z<14;z+=2)this.box(floor,side*4.8,.115,z,.07,.02,1.25,'#8dada9');
   this.box(floor,side*23.6,-1.3,-9,2.4,2,5.5,'#182d36');this.box(floor,side*23.8,-.25,-9,2,.08,4,'#344f59');
   for(let z=-10.5;z<-7.4;z+=.55)this.box(floor,side*23.8,-.15,z,1.5,.04,.15,'#1c303a');
  }
  for(const o of OBSTACLES){if(o.x===0&&o.z===0)continue;const crate=new THREE.Group();crate.position.set(o.x,0,o.z);this.box(crate,0,o.h/2,0,o.w,o.h,o.d,'#253c46');this.box(crate,0,o.h+.04,0,o.w+.06,.16,o.d+.06,'#4b6268');this.box(crate,0,o.h+.14,0,o.w*.78,.05,o.d*.72,'#344a52');for(const side of [-1,1]){this.box(crate,side*(o.w/2-.18),o.h/2,0,.2,o.h+.1,o.d+.1,'#6a7771');this.box(crate,side*(o.w/2-.18),o.h+.16,0,.14,.02,o.d*.5,'#c4ab66');}this.box(crate,0,o.h*.6,o.d/2+.02,o.w*.4,.08,.04,'#63c3ce',true);this.scene.add(crate);}
  this.cylinder(floor,0,.25,0,3.15,.45,'#1b333d',12);this.ring(floor,0,.49,0,2.9,'#4c979f',.025);
  this.cylinder(floor,0,.6,0,2.25,.65,'#334e57',8);this.cylinder(floor,0,2,0,1.25,2.4,'#123e48',12);this.cylinder(floor,0,2.3,0,.78,2.9,'#75dfeb',16,true);this.cylinder(floor,0,4,0,1.75,.5,'#536770',8);
  for(let n=0;n<6;n++){const a=n*Math.PI/3;this.box(floor,Math.cos(a)*1.65,2.1,Math.sin(a)*1.65,.24,3.5,.24,'#6c8288');}
  for(let i=0;i<3;i++){const ring=this.ring(floor,0,1.3+i*.9,0,1.85,'#82e6e3',.05);this.rings.push(ring);}
  const halo=this.ring(floor,0,4.8,0,1.2,'#8fffe7',.025);this.rings.push(halo);this.label(floor,'KEPLER / 09',0,.14,4.4,7,'#7d9698');this.label(floor,'EVAC',0,.13,-10,3,'#72958f');
  for(const [i,p] of [{x:-16,z:-8},{x:16,z:-8},{x:0,z:12}].entries()){
   const g=new THREE.Group();g.position.set(p.x,0,p.z);this.cylinder(g,0,.2,0,1.45,.35,'#2b4148',8);this.box(g,0,.85,0,1.1,1.5,1,'#39545d');this.box(g,0,1.65,0,1.2,.15,1.1,'#799091');this.box(g,0,1.25,.53,.72,.36,.04,'#efaa58',true);const ring=this.ring(g,0,.14,0,2.4,'#9c763e',.025);ring.name='range';const lamp=this.cylinder(g,0,2,0,.1,.55,'#ffbd6b',8,true);lamp.name='lamp';this.label(g,`0${i+1}`,0,.13,2,2,'#e7c68e');this.scene.add(g);this.relays.push(g);
  }
  // The masts and piping belong to the real-time scene, not a background image.
  for(const x of [-19,19]){this.box(floor,x,2.8,-15,1,5.6,1,'#344d56');this.box(floor,x,5.7,-15,1.5,.35,1.5,'#61747a');this.box(floor,x,6.1,-15,.12,.7,.12,'#c98d54',true);}
  this.box(floor,0,5.6,-16,37,.32,.35,'#2d4149');for(const x of [-12,-6,6,12])this.box(floor,x,5.45,-15.8,2.2,.08,.15,'#8fc7cb',true);
 }
 makeExtraction(){const g=new THREE.Group();g.position.set(EXTRACTION.x,0,EXTRACTION.z);this.cylinder(g,0,.1,0,2.9,.12,'#29454c',12);this.ring(g,0,.19,0,2.8,'#559b8c',.045);for(const x of [-1.8,1.8]){this.box(g,x,.25,0,.24,.2,2.5,'#647b76');}this.label(g,'↑  ↑  ↑',0,.19,0,3,'#9bbba7');return g;}
 makePlayer(color:string){const g=new THREE.Group();const shadow=new THREE.Mesh(new THREE.CircleGeometry(.7,24),new THREE.MeshBasicMaterial({color:'#04090b',transparent:true,opacity:.4,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.12;g.add(shadow);this.ring(g,0,.13,0,.66,color,.028);
  this.box(g,-.23,.43,0,.3,.65,.36,'#1c303a');this.box(g,.23,.43,0,.3,.65,.36,'#1c303a');this.box(g,0,.94,0,.78,.66,.46,'#66797a');this.box(g,0,1.08,-.26,.55,.4,.22,color);this.box(g,0,.9,-.38,.48,.63,.24,'#334d52');
  const head=this.cylinder(g,0,1.58,0,.32,.42,'#bacbc5',8);head.rotation.y=Math.PI/8;this.box(g,0,1.62,.29,.48,.12,.06,color,true);this.box(g,-.5,1.12,.08,.24,.42,.28,color);this.box(g,.5,1.12,.25,.24,.34,.55,'#a2aea2');this.box(g,.37,1.1,.58,.2,.23,1.05,'#192b35');this.box(g,.37,1.13,1.12,.12,.12,.12,color,true);
  return g;
 }
 makeEnemy(kind:string){const g=new THREE.Group();if(kind==='brute'){this.box(g,0,.7,0,1.1,1.2,.9,'#593c39');this.box(g,0,1.55,0,.8,.45,.65,'#b58972');for(const side of [-1,1])this.box(g,side*.7,.8,0,.4,.8,.6,'#79554a');this.box(g,0,1.58,.35,.52,.1,.05,'#ff6f42',true);}
 else{this.cylinder(g,0,.8,0,.43,.42,kind==='spitter'?'#73587a':'#79766d',6);this.box(g,0,.85,.4,.28,.13,.12,kind==='spitter'?'#da8fff':'#ff7c54',true);for(const side of [-1,1]){const arm=this.box(g,side*.54,.7,0,.7,.12,.12,'#485660');arm.rotation.y=side*.45;this.box(g,side*.7,.5,.22,.12,.6,.12,'#77858b');}}
  return g;
 }
 setQuality(value:string){this.quality=value;this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,value==='high'?1.75:1));this.renderer.shadowMap.enabled=value==='high';this.resize();}
 resize(){const r=this.canvas.parentElement!.getBoundingClientRect();this.width=Math.max(r.width,1);this.height=Math.max(r.height,1);this.renderer.setSize(this.width,this.height,false);this.composer.setSize(this.width,this.height);this.camera.updateProjectionMatrix();}
 aim(clientX:number,clientY:number){const rect=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2(((clientX-rect.left)/rect.width)*2-1,-((clientY-rect.top)/rect.height)*2+1),this.camera);this.ray.ray.intersectPlane(this.plane,this.floorAim);return {x:this.floorAim.x,z:this.floorAim.z};}
 screenPosition(x:number,z:number,y=2){const v=new THREE.Vector3(x,y,z).project(this.camera);return {x:(v.x*.5+.5)*this.width,y:(-v.y*.5+.5)*this.height};}
 handleEvent(e:Event,myId:string){if(e.id<=this.eventCursor)return;this.eventCursor=e.id;
  const isKill=e.kind==='kill',isHit=e.kind==='hit',isSkill=['skill','relay','heal','revive'].includes(e.kind);if(isHit&&e.owner===myId)this.shake=Math.max(this.shake,.07);if(isKill)this.shake=Math.max(this.shake,.1);
  const n=isKill?15:isSkill?28:e.kind==='dash'?10:isHit?4:e.kind==='shot'?2:0;
  const color=isKill?'#faaa65':isSkill?'#b6f06b':isHit?'#ffb775':'#92e8e9';
  for(let i=0;i<n&&this.particles.length<180;i++){const m=new THREE.Mesh(this.sparkGeo,this.mat(color,true));m.position.set(e.x,.7+Math.random()*.5,e.z);this.scene.add(m);const max=isKill?.6:isSkill?.7:.2;this.particles.push({mesh:m,vx:(Math.random()-.5)*9,vz:(Math.random()-.5)*9,vy:Math.random()*5,life:max,max});}
 }
 render(s:State,dt:number,myId:string,menu:boolean,reducedMotion=false){
  this.time+=dt;this.menu=menu;const aspect=this.width/this.height;const halfHeight=menu?23:aspect<1?23/aspect:21;this.camera.left=-halfHeight*aspect;this.camera.right=halfHeight*aspect;this.camera.top=halfHeight;this.camera.bottom=-halfHeight;this.camera.near=.1;this.camera.far=250;this.camera.updateProjectionMatrix();
  const tx=menu&&aspect>1.25?-13:0;this.target.x=THREE.MathUtils.damp(this.target.x,tx,5,dt);this.shake=Math.max(0,this.shake-dt*.55);const sx=reducedMotion?0:(Math.random()-.5)*this.shake;
  this.camera.position.set(this.target.x+sx,42,31);this.camera.lookAt(this.target.x,0,0);
  for(const [i,r]of this.rings.entries()){r.rotation.z=this.time*(i%2===0?.18:-.13);if(!reducedMotion)r.position.y=(i<3?1.3+i*.9:4.8)+Math.sin(this.time*1.5+i)*.08;}
  this.coreLight.intensity=45+(reducedMotion?0:Math.sin(this.time*1.7)*10);
  for(const [i,g]of this.relays.entries()){const relay=s.relays[i];const lamp=g.getObjectByName('lamp') as THREE.Mesh;lamp.material=this.mat(relay.active?'#b6f06b':'#efaa58',true);const range=g.getObjectByName('range') as THREE.Mesh;range.material=this.mat(relay.active?'#5c9f79':'#9c763e',true);}
  const activeIds=new Set(s.players.map(p=>p.id));for(const [id,g]of this.players)if(!activeIds.has(id)){this.scene.remove(g);this.players.delete(id);}
  for(const p of s.players){let g=this.players.get(p.id);if(!g){g=this.makePlayer(COLORS[p.slot%4]);g.position.set(p.x,0,p.z);this.players.set(p.id,g);this.scene.add(g);}const alpha=1-Math.exp(-22*dt);g.position.x+=(p.x-g.position.x)*alpha;g.position.z+=(p.z-g.position.z)*alpha;g.rotation.y=Math.PI/2-p.angle;g.rotation.z=p.hp<=0?Math.PI/2:0;g.position.y=p.hp<=0?-.2:Math.sin(this.time*12)*.02;g.visible=p.connected||p.down>0;}
  const enemyIds=new Set(s.enemies.map(e=>e.id));for(const [id,g]of this.enemies)if(!enemyIds.has(id)){this.scene.remove(g);this.disposeGroup(g);this.enemies.delete(id);}
  for(const e of s.enemies){let g=this.enemies.get(e.id);if(!g){g=this.makeEnemy(e.kind);g.position.set(e.x,0,e.z);this.enemies.set(e.id,g);this.scene.add(g);}g.position.x=THREE.MathUtils.damp(g.position.x,e.x,15,dt);g.position.z=THREE.MathUtils.damp(g.position.z,e.z,15,dt);g.position.y=e.kind==='brute'?0:Math.sin(this.time*5+e.id)*.13;g.rotation.y=Math.PI/2-e.angle;}
  const boltIds=new Set(s.bolts.map(b=>b.id));for(const [id,m]of this.bolts)if(!boltIds.has(id)){this.scene.remove(m);this.bolts.delete(id);}
  for(const b of s.bolts){let m=this.bolts.get(b.id);if(!m){m=new THREE.Mesh(this.unitBox,this.mat(b.enemy?'#fa7759':'#ceffe7',true));this.bolts.set(b.id,m);this.scene.add(m);}m.position.set(b.x,.94,b.z);m.rotation.y=-Math.atan2(b.vz,b.vx);m.scale.set(b.enemy?.45:.9,.07,.07);}
  const dropIds=new Set(s.pickups.map(d=>d.id));for(const [id,g]of this.drops)if(!dropIds.has(id)){this.scene.remove(g);this.drops.delete(id);}for(const d of s.pickups){let g=this.drops.get(d.id);if(!g){g=new THREE.Group();this.box(g,0,0,0,.5,.18,.5,'#8ee5ad',true);this.box(g,0,.11,0,.35,.05,.09,'#ffffff',true);this.box(g,0,.11,0,.09,.05,.35,'#ffffff',true);this.scene.add(g);this.drops.set(d.id,g);}g.position.set(d.x,.4+Math.sin(this.time*3)*.15,d.z);g.rotation.y=this.time;}
  if(s.phase==='extract'){this.extract.children.forEach(c=>{if(c instanceof THREE.Mesh&&c.geometry.type==='TorusGeometry')c.material=this.mat(s.extraction<=0?'#b6f06b':'#d2a067',true);});}
  for(const e of s.events)this.handleEvent(e,myId);
  for(const p of this.particles){p.life-=dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.z+=p.vz*dt;p.mesh.position.y+=p.vy*dt;p.vy-=12*dt;p.mesh.scale.setScalar(Math.max(0,p.life/p.max)*1.5);if(p.life<=0)this.scene.remove(p.mesh);}this.particles=this.particles.filter(p=>p.life>0);
  if(this.quality==='high')this.composer.render();else this.renderer.render(this.scene,this.camera);
 }
 disposeGroup(g:THREE.Object3D){g.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry!==this.unitBox&&o.geometry!==this.unitSphere&&o.geometry!==this.sparkGeo)o.geometry.dispose();});}
 dispose(){this.observer.disconnect();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if('map'in m&&(m as THREE.MeshStandardMaterial).map)(m as THREE.MeshStandardMaterial).map!.dispose();m.dispose();}}});this.composer.dispose();this.renderer.dispose();}
}
