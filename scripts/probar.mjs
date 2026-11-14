import { io } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';

const base = process.env.TEST_URL || 'http://localhost:3080';
const out = process.env.TEST_OUTPUT;
if (!out) throw Error('Define TEST_OUTPUT fuera del repositorio');
await mkdir(out, { recursive: true });
const privateFile = path.join(out, 'cuentas_privadas.json');
let accounts;
try { accounts = JSON.parse(await readFile(privateFile, 'utf8')); }
catch { accounts = Object.fromEntries(['gustavo', 'jovanni', 'musica', 'arte'].map(u => [u, {password: randomBytes(20).toString('hex')} ])); }
const results = [];
const streams = [];
const sockets = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
async function api(route, method='GET', body, cookie) {
  const r = await fetch(base+route, {method, headers:{'Content-Type':'application/json', ...(cookie ? {Cookie:cookie} : {})}, body:body ? JSON.stringify(body) : undefined});
  return {status:r.status, data:await r.json(), cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function ok(name, detail) { results.push({prueba:name, resultado:'Aprobada', detalle:detail}); console.log('APROBADA | '+name+' | '+detail); }
async function until(fn, timeout=30000) { const end=Date.now()+timeout; while(Date.now()<end) { const x=await fn(); if(x) return x; await delay(500); } throw Error('Tiempo agotado esperando resultado real'); }
function publish(username, key, seconds=0) {
  const host = new URL(base).hostname;
  const rtmp = `rtmp://${host}:${process.env.TEST_RTMP_PORT || 1935}/live/${username}?key=${key}`;
  const args=['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=frequency=440','-c:v','libx264','-preset','veryfast','-b:v','2500k','-maxrate','2500k','-bufsize','5000k','-g','60','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k'];
  if(seconds) args.push('-t',String(seconds));
  args.push('-f','flv',rtmp);
  const p=spawn(process.env.TEST_FFMPEG || '/opt/homebrew/bin/ffmpeg',args,{stdio:['pipe','ignore','pipe']});
  let errors=''; p.stderr.on('data',d=>{errors+=d});
  p.done=new Promise(r=>p.on('close',code=>r({code,errors:errors.replaceAll(key,'[clave protegida]')})));
  streams.push(p); return p;
}
async function connect(cookie) { const s=io(base,{transports:['websocket'],extraHeaders: cookie ? {Cookie:cookie}:{}}); sockets.push(s); await new Promise((r,j)=>{s.once('connect',r);s.once('connect_error',j)});return s; }
function once(s,event,ms=5000) { return new Promise((r,j)=>{const t=setTimeout(()=>j(Error('Sin evento '+event)),ms);s.once(event,x=>{clearTimeout(t);r(x)});}); }
try {
  assert.equal((await api('/api/register','POST',{username:'x',password:'prueba123'})).status,400);
  ok('Nombre inválido','El registro de x devolvió HTTP 400');
  for (const [username, account] of Object.entries(accounts)) {
    let r=await api('/api/register','POST',{username,password:account.password});
    if(r.status===409) r=await api('/api/login','POST',{username,password:account.password});
    assert.equal(r.status,200);account.cookie=r.cookie;
    const category={gustavo:'Educación',jovanni:'Programación',musica:'Música',arte:'Arte'}[username];
    await api('/api/dashboard','PUT',{title:{gustavo:'StreamLab: práctica de streaming en AWS',jovanni:'Código y nube',musica:'Audio de prueba',arte:'Canal de arte'}[username],category,bio:'Canal de prueba de la práctica de Cómputo en la Nube.'},r.cookie);
    account.key=(await api('/api/dashboard','GET',null,r.cookie)).data.stream_key;
  }
  await writeFile(privateFile,JSON.stringify(accounts),{mode:0o600});
  const invalid=publish('gustavo','MALA',3);assert.notEqual((await invalid.done).code,0);
  assert.equal((await api('/api/channels/gustavo')).data.is_live,false);
  ok('Clave incorrecta','RTMP rechazó la publicación y el canal siguió desconectado');
  const main=publish('gustavo',accounts.gustavo.key);
  const other=publish('jovanni',accounts.jovanni.key);
  const music=publish('musica',accounts.musica.key);
  await until(async()=> (await api('/api/channels?live=1')).data.length===3);
  await until(async()=> (await fetch(base+'/media/live/gustavo/index.m3u8')).ok);
  ok('Transmisión válida','Tres canales en vivo y lista HLS disponible');
  const a=await connect(accounts.gustavo.cookie), b=await connect(accounts.jovanni.cookie);
  a.emit('join','gustavo');b.emit('join','gustavo');
  await until(async()=> (await api('/api/channels/gustavo')).data.viewers===2);
  ok('Dos espectadores','El contador de la sala llegó a 2');
  let messages=[once(a,'chat'),once(b,'chat')];a.emit('chat','¿Se ve y se escucha bien?');assert.ok((await Promise.all(messages)).every(m=>m.text==='¿Se ve y se escucha bien?'));
  messages=[once(a,'chat'),once(b,'chat')];b.emit('chat','Sí, el video avanza y se escucha el audio.');await Promise.all(messages);
  ok('Chat entre dos usuarios','Ambas conexiones recibieron los dos mensajes');
  const guest=await connect();guest.emit('join','gustavo');await delay(200);const err=once(guest,'chat:error');guest.emit('chat','Prueba sin sesión');assert.equal(await err,'Inicia sesión para chatear');guest.disconnect();
  ok('Chat sin sesión','El servidor pidió iniciar sesión');
  assert.equal((await api('/api/channels/gustavo/follow','POST',{},accounts.gustavo.cookie)).status,400);
  let following=(await api('/api/channels/gustavo')).data.followers;
  const list=(await api('/api/following','GET',null,accounts.jovanni.cookie)).data;
  if(list.some(x=>x.username==='gustavo')) {await api('/api/channels/gustavo/follow','POST',{},accounts.jovanni.cookie); following--;}
  const f=await api('/api/channels/gustavo/follow','POST',{},accounts.jovanni.cookie);assert.equal(f.data.following,true);assert.equal(f.data.followers,following+1);
  assert.ok((await api('/api/following','GET',null,accounts.jovanni.cookie)).data.some(x=>x.username==='gustavo'));
  ok('Seguidores','Bloqueó seguirse a sí mismo; seguir a otro sumó 1 y apareció en Siguiendo');
  const probe=spawn(process.env.TEST_FFPROBE || '/opt/homebrew/bin/ffprobe',['-v','error','-read_intervals','%+3','-select_streams','v','-show_entries','packet=pts_time','-of','csv=p=0',base+'/media/live/gustavo/index.m3u8'],{stdio:['ignore','pipe','pipe']});
  let pts='';probe.stdout.on('data',d=>pts+=d);await new Promise(r=>probe.on('close',r));
  const times=pts.split('\n').map(parseFloat).filter(Number.isFinite);assert.ok(Math.max(...times)-Math.min(...times)>2);
  ok('Reproducción HLS','Se recibieron fotogramas con más de 2 segundos de avance');
  for(const p of [main,other,music]) p.stdin.write('q');
  await Promise.all([main.done,other.done,music.done]);
  await until(async()=>!(await api('/api/channels/gustavo')).data.is_live);
  const vod=await until(async()=> (await api('/api/channels/gustavo')).data.vods.find(v=>v.size_mb>0.05));
  assert.equal((await fetch(base+vod.url)).status,200);
  ok('Desconexión y VOD','El canal quedó desconectado y la grabación MP4 se descargó');
  const old=accounts.gustavo.key;
  const regen=await api('/api/dashboard/regenerate-key','POST',{},accounts.gustavo.cookie);accounts.gustavo.key=regen.data.stream_key;
  await writeFile(privateFile,JSON.stringify(accounts),{mode:0o600});
  assert.notEqual(old,accounts.gustavo.key);assert.notEqual((await publish('gustavo',old,2).done).code,0);
  ok('Regenerar clave','La clave cambió y RTMP rechazó la anterior');
  await writeFile(path.join(out,'pruebas.json'),JSON.stringify({url:base,fecha:new Date().toISOString(),resultados:results},null,2));
  console.log(`Resultado: ${results.length}/10 pruebas aprobadas`);
} finally {
  for(const s of sockets)s.disconnect();
  for(const p of streams)if(p.exitCode===null)p.kill('SIGTERM');
}
