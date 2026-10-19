import {ledTwoSided} from '../boards/boards.js';
// Shared venue kit: renderer/lights/day-night, LED ribbons from boards.json, kit-dressed players, canvas markings.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadKits,kitMaterials} from '../players/kits.js';
export {T};
export const q=new URLSearchParams(location.search);
export async function setup({day=0x9fc3e0,indoor=false}={}){
 const night=q.get('time')?q.get('time')==='night':false;
 const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(innerWidth,innerHeight);r.toneMapping=T.ACESFilmicToneMapping;r.shadowMap.enabled=true;document.body.appendChild(r.domElement);
 const S=new T.Scene();S.background=new T.Color(indoor?0x0d1117:(night?0x070b14:day));
 S.add(new T.HemisphereLight(0xdfefff,0x334433,indoor?0.5:(night?0.2:1.1)));
 const sun=new T.DirectionalLight(0xffffff,indoor?1.6:(night?0.4:2.2));sun.position.set(80,160,60);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,far:500});S.add(sun);
 const c=new T.PerspectiveCamera(40,innerWidth/innerHeight,0.1,3000);const ctl=new OrbitControls(c,r.domElement);
 return {r,S,c,ctl,night};}
const GLB_WEB=new URL('../glb/web/',import.meta.url);const L=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);export const load=(file)=>L.loadAsync(new URL(file,GLB_WEB).href+'?'+Date.now());
export const mat=(color,o={})=>new T.MeshStandardMaterial({color,roughness:0.8,...o});
export function box(S,w,h,d,color,x,y,z,o={}){const m=new T.Mesh(new T.BoxGeometry(w,h,d),typeof color==='object'?color:mat(color,o));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;S.add(m);return m;}
export function canvasPlane(S,w,d,draw,ppm=10,y=0.02){const c=document.createElement('canvas');c.width=Math.round(w*ppm);c.height=Math.round(d*ppm);const x=c.getContext('2d');draw(x,ppm,c.width,c.height);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;const m=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshStandardMaterial({map:t,roughness:0.85}));m.rotation.x=-Math.PI/2;m.position.y=y;m.receiveShadow=true;S.add(m);return m;}
// stepped seating along a rectangle/ellipse: rows of boxes with crowd texture
let crowdTex=null;function crowd(){if(crowdTex)return crowdTex;const c=document.createElement('canvas');c.width=512;c.height=64;const x=c.getContext('2d');x.fillStyle='#22324a';x.fillRect(0,0,512,64);
 const pal=['#d9d9d9','#1a1a1a','#c23b3b','#e2c044','#5a7bb8','#7a5236','#e8b598','#3c8c5a'];for(let i=0;i<900;i++){x.fillStyle=pal[(Math.random()*pal.length)|0];x.fillRect(Math.random()*512,8+Math.random()*44,3,7);}
 crowdTex=new T.CanvasTexture(c);crowdTex.colorSpace=T.SRGBColorSpace;crowdTex.wrapS=T.RepeatWrapping;crowdTex.anisotropy=8;return crowdTex;}
let facM=null;export function facadeMat(){if(facM)return facM;const c=document.createElement('canvas');c.width=256;c.height=256;const x=c.getContext('2d');x.fillStyle='#b9bcc2';x.fillRect(0,0,256,256);x.fillStyle='#9a9ea6';for(let y=0;y<256;y+=64)x.fillRect(0,y,256,6);x.fillStyle='#2c3644';for(let y=20;y<256;y+=64)for(let xx=8;xx<256;xx+=32)x.fillRect(xx,y,20,26);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(12,1);facM=new T.MeshStandardMaterial({map:t,roughness:0.9});return facM;}
export function standRect(S,{w,d,gap=4,rows=10,rowH=0.8,rowD=1.0,y0=0.5,sides=[1,1,1,1]}){ // four straight stands around a w x d rectangle
 const tex=crowd();const g=new T.Group();
 const add=(len,ang,off)=>{for(let k=0;k<rows;k++){const t=tex.clone();t.repeat.x=len/12;t.needsUpdate=true;const m=new T.Mesh(new T.BoxGeometry(len+k*2*rowD,rowH,rowD),[mat(0x8b9097),mat(0x8b9097),mat(0x8b9097),mat(0x8b9097),new T.MeshStandardMaterial({map:t,roughness:0.9}),mat(0x8b9097)]);
  const r=off+gap+k*rowD;m.position.set(Math.sin(ang)*r,y0+k*rowH,Math.cos(ang)*r);m.rotation.y=ang+Math.PI;m.receiveShadow=true;g.add(m);}
  const H=y0+rows*rowH,R=off+gap+rows*rowD-rowD/2+0.15,L=len+rows*2*rowD;const f=new T.Mesh(new T.BoxGeometry(L,H,0.3),facadeMat());f.position.set(Math.sin(ang)*R,H/2,Math.cos(ang)*R);f.rotation.y=ang;g.add(f);};
 if(sides[0])add(w,0,d/2);if(sides[1])add(w,Math.PI,d/2);if(sides[2])add(d,Math.PI/2,w/2);if(sides[3])add(d,-Math.PI/2,w/2);
 if(sides.every(Boolean)){const D=rows*rowD,H=y0+rows*rowH;for(const sx of[-1,1])for(const sz of[-1,1]){const c=new T.Mesh(new T.BoxGeometry(D+gap,H,D+gap),[facadeMat(),facadeMat(),mat(0x8b9097),facadeMat(),facadeMat(),facadeMat()]);c.position.set(sx*(w/2+(gap+D)/2),H/2,sz*(d/2+(gap+D)/2));g.add(c);}}
 S.add(g);return g;}
// LED ribbons: list of {pts:[[x,z]...], y, h, closed}; slides from boards/boards.json; faces inward (double-sided)
export async function ledRibbons(S,paths,night,cfgUrl){
 const boardsJson=cfgUrl||new URL('../boards/boards.json',import.meta.url).href;
 const cfg=await (await fetch(boardsJson+'?'+Date.now())).json();
 const imgs=await Promise.all(cfg.slides.map(s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=new URL('../'+s.image,import.meta.url).href;})));
 const cv=document.createElement('canvas');cv.width=1024;cv.height=120;const x=cv.getContext('2d');const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=T.RepeatWrapping;tex.anisotropy=8;
 let si=0,tIn=0;const draw=()=>{const s=cfg.slides[si],im=imgs[si];x.fillStyle=s.bg||'#000';x.fillRect(0,0,1024,120);if(im){const h=96,w=h*im.width/im.height;x.drawImage(im,(1024-w)/2,12,w,h);}x.fillStyle='rgba(0,0,0,0.18)';for(let y=0;y<120;y+=3)x.fillRect(0,y,1024,1);tex.needsUpdate=true;};draw();
 const m=new T.MeshStandardMaterial({color:0,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:night?1.6:1.1,side:T.DoubleSide});ledTwoSided(m);
 for(const p of paths){const pts=p.closed?[...p.pts,p.pts[0]]:p.pts;const pos=[],uv=[],idx=[];let len=0;
  pts.forEach((v,i)=>{if(i)len+=Math.hypot(v[0]-pts[i-1][0],v[1]-pts[i-1][1]);const u=len/(cfg.tileMeters*(p.h/(cfg.height||1.4)));pos.push(v[0],p.y,v[1],v[0],p.y+p.h,v[1]);uv.push(u,0,u,1);if(i<pts.length-1){const b=i*2;idx.push(b,b+2,b+1,b+1,b+2,b+3);}});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();S.add(new T.Mesh(g,m));}
 return {update(dt){tIn+=dt;const s=cfg.slides[si];tex.offset.x-=(s.scroll||0)*dt;if(tIn>=s.duration){tIn=0;si=(si+1)%cfg.slides.length;draw();}}};}
export const rectPath=(w,d)=>[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
export const ellPath=(a,b,n=96)=>[...Array(n)].map((_,i)=>[Math.cos(i/n*Math.PI*2)*a,Math.sin(i/n*Math.PI*2)*b]);
// players dressed from kits.json; spots: [{kit,x,z,yaw,anim:'run'|'kick'|'idle',scale}]
export async function players(S,spots,play=null){const base=await load('player-figure.glb'),kits=await loadKits(new URL('../players/kits.json',import.meta.url).href);const cache={};const mixers=[];const P=[];
 const clip=n=>T.AnimationClip.findByName(base.animations,n);
 for(const s of spots){const mats=cache[s.kit]??=kitMaterials(base.scene,kits[s.kit]);const p=base.scene.clone(true);p.traverse(o=>{if(o.isMesh){o.material=mats[o.material.name]||o.material;o.castShadow=true;}});
  p.position.set(s.x,s.y||0,s.z);p.rotation.y=s.yaw||0;p.scale.setScalar(s.scale||1);S.add(p);const mx=new T.AnimationMixer(p);const a=mx.clipAction(clip(s.anim==='kick'?'kick':'run'));a.play();a.time=Math.random()*0.7;a.timeScale=s.anim==='idle'?0.0:1;if(s.anim==='idle')a.time=0.05;mixers.push(mx);
  const k=mx.clipAction(clip('kick'));k.setLoop(T.LoopOnce,1);P.push({p,s,mx,a,k,home:new T.Vector3(s.x,0,s.z),cool:0});}
 if(!play)return {update:dt=>mixers.forEach(m=>m.update(dt))};
 // simple match play (v5-style): nearest player chases a loose ball, kicks/passes to a teammate, others drift with the play
 const sc=play.scale||spots[0].scale||1,cast=P.filter(q=>q.s.kit!=='umpire');const ball=new T.Mesh(new T.SphereGeometry(0.16*sc*(play.ball||1),12,8),new T.MeshStandardMaterial({color:play.ballColor||0xf2f2f2,roughness:0.5}));ball.castShadow=true;S.add(ball);
 const bp=cast[0].p.position.clone().add(new T.Vector3(1,0,1));let fl=null;ball.position.set(bp.x,0.2*sc,bp.z);
 const B=play.bounds,clampP=(v,h)=>{if(B){v.x=Math.max(-B[0]/2,Math.min(B[0]/2,v.x));v.z=Math.max(-B[1]/2,Math.min(B[1]/2,v.z));}if(play.net&&h){const sg=Math.sign(h.x)||1;if(v.x*sg<1*sc)v.x=sg*1*sc;}};
 const step=dt=>{let chaser=null,best=1e9;if(!fl)for(const q of cast){const d=q.p.position.distanceTo(new T.Vector3(ball.position.x,0,ball.position.z));if(d<best&&q.cool<=0){best=d;chaser=q;}}
  for(const q of P){let tgt;if(q===chaser)tgt=new T.Vector3(ball.position.x,0,ball.position.z);else tgt=q.home.clone().lerp(new T.Vector3(ball.position.x,0,ball.position.z),0.3);
   const v=tgt.sub(q.p.position);v.y=0;const d=v.length(),spd=(q===chaser?6:3)*sc;q.cool-=dt;
   if(d>0.3*sc){q.p.position.addScaledVector(v.normalize(),Math.min(d,spd*dt));q.p.rotation.y=Math.atan2(v.x,v.z);q.a.timeScale=q===chaser?1.2:0.8;q.wt=(q.wt||Math.random()*9)+dt;q.p.rotation.z=Math.sin(q.wt*9)*0.14;q.p.rotation.x=0.08+Math.sin(q.wt*4.5)*0.05;}else{q.a.timeScale=0.0;q.p.rotation.z*=0.8;q.p.rotation.x*=0.8;}
   clampP(q.p.position,q.home);
   if(q===chaser&&d<0.8*sc){const team=cast.filter(o=>o!==q&&o.s.kit===q.s.kit),to=(team.length?team:cast.filter(o=>o!==q))[Math.floor(Math.random()*(team.length||cast.length-1))];
    const tb=to.p.position.clone().add(new T.Vector3((Math.random()-0.5)*4*sc,0,(Math.random()-0.5)*4*sc));clampP(tb,to.home);fl={a:ball.position.clone(),b:tb,t:0,T:1.1,h:(play.loft||3)*sc};q.k.reset().play();q.cool=1.5;}}
  if(fl){fl.t+=dt;const u=Math.min(1,fl.t/fl.T);ball.position.lerpVectors(fl.a,fl.b,u);ball.position.y=0.2*sc+Math.sin(Math.PI*u)*fl.h;if(u>=1){ball.position.y=0.2*sc;fl=null;}}
  mixers.forEach(m=>m.update(dt));};
 for(let i=0;i<Math.round((play.warm||3.5)/0.05);i++)step(0.05);
 return {update:step};}
export function run(r,S,c,updaters){const clk=new T.Clock();const still=q.has('still');if(q.get('cam')){const v=q.get('cam').split(',').map(Number);c.position.set(v[0],v[1],v[2]);c.lookAt(0,0,0);}
 if(still){for(let i=0;i<60;i++)updaters.forEach(u=>u(1/30));r.render(S,c);window.DONE=true;return;}
 const loop=()=>{const dt=Math.min(clk.getDelta(),0.05);updaters.forEach(u=>u(dt));r.render(S,c);requestAnimationFrame(loop);};loop();window.DONE=true;}
