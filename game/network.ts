import type { Input,State } from './engine';
export type Session={code:string;id:string;token:string;slot:number;state:State};
export type LinkStatus='connecting'|'online'|'reconnecting'|'offline';
export class GameConnection{
 ws:WebSocket|null=null;session:Session;closed=false;attempt=0;timer:ReturnType<typeof setTimeout>|null=null;watch:ReturnType<typeof setInterval>;lastReceived=Date.now();ready=false;action:'start'|'restart'|null=null;
 constructor(session:Session,private onState:(s:State,latency:number)=>void,private onStatus:(s:LinkStatus,error?:string)=>void){this.session=session;this.open();this.watch=setInterval(()=>{if(this.ready&&Date.now()-this.lastReceived>9000)this.ws?.close();},2000);}
 open(){if(this.closed)return;this.onStatus(this.attempt?'reconnecting':'connecting');this.ready=false;this.ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/socket?room=${this.session.code}`);
  this.ws.onopen=()=>{this.lastReceived=Date.now();this.ws?.send(JSON.stringify({type:'auth',id:this.session.id,token:this.session.token,time:Date.now()}));};
  this.ws.onmessage=e=>{try{const msg=JSON.parse(e.data);this.lastReceived=Date.now();if(msg.type==='ready'){this.ready=true;this.attempt=0;this.onStatus('online');}if(msg.type==='state'){if(this.action==='start'&&msg.state.phase!=='lobby')this.action=null;if(this.action==='restart'&&msg.state.phase==='lobby')this.action=null;this.onState(msg.state,Math.max(0,Date.now()-Number(msg.echo)));this.onStatus('online');}if(msg.type==='error')this.onStatus('reconnecting',msg.error);}catch{this.onStatus('offline','Неверный ответ станции.');}};
  this.ws.onclose=e=>{this.ready=false;if(this.closed)return;if(e.code===1008||this.attempt>=5){this.onStatus('offline',e.reason||'Связь потеряна. Вернитесь в меню и войдите в отряд снова.');return;}this.onStatus('reconnecting');this.timer=setTimeout(()=>this.open(),Math.min(500*2**this.attempt++,5000));};this.ws.onerror=()=>{};
 }
 send(input:Input){if(this.ready&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:this.action??'input',input,time:Date.now()}));}
 request(action:'start'|'restart'){this.action=action;}
 disconnect(leave=true){this.closed=true;if(leave&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({type:'leave'}));this.ws?.close();if(this.timer)clearTimeout(this.timer);clearInterval(this.watch);}
}
