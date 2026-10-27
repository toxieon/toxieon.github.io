// flyby.js — live-camera ball fly-past. MIT. Original code; needs three (r150+). No DOM needed (works headless in node for tests).
// startBallFlyby({scene,camera,ball,from,sport,duration,sponsorTexture}) -> {update(dt),cancel(),done,progress,stats}
// The path is recomputed EVERY frame from the camera's current matrix/fov/aspect/near/far, so a user (or a script) can move the camera mid-flight.
import * as THREE from './three.module.min.js';

// ---- per-sport parameters -------------------------------------------------------------------------------------------------------------------
// dur  seconds · arc  lob height as a fraction of the start→pass distance · bounce [count,heightFraction] (ground bounce on the approach)
// spin {kind:'side'|'long'|'vert'|'flat'|'free', rate: rev/s, axis?:[x,y,z]} · fill  ball radius at the closest pass as a fraction of the half-screen (min of half-width/half-height)
// passX  horizontal NDC offset of the pass (0..1) · wobble  extra precession for spirals
export const SPORTS={
 'afl':               {dur:2.5,arc:.26,spin:{kind:'long',rate:8},fill:0.45,passX:.34,wobble:.05},
 'rugby-league':      {dur:2.3,arc:.20,spin:{kind:'long',rate:4.5},fill:0.45,passX:.34,wobble:.07},
 'rugby-union':       {dur:2.3,arc:.20,spin:{kind:'long',rate:4.5},fill:0.45,passX:.34,wobble:.07},
 'american-football': {dur:2.5,arc:.30,spin:{kind:'long',rate:9},fill:0.45,passX:.34,wobble:.04},
 'basketball':        {dur:2.3,arc:.40,spin:{kind:'side',rate:1.6},fill:0.42,passX:.36},
 'netball':           {dur:2.2,arc:.34,spin:{kind:'side',rate:1.4},fill:0.42,passX:.36},
 'volleyball':        {dur:2.0,arc:.26,spin:{kind:'free',rate:.7,axis:[.3,1,.2]},fill:0.45,passX:.36},
 'water-polo':        {dur:2.0,arc:.26,spin:{kind:'free',rate:.8,axis:[.2,1,.3]},fill:0.45,passX:.36},
 'soccer':            {dur:2.3,arc:.26,spin:{kind:'free',rate:2.2,axis:[.35,.7,.2]},fill:0.45,passX:.36},
 'cricket-red':       {dur:1.8,arc:.07,bounce:[1,.05],spin:{kind:'side',rate:6},fill:0.39,passX:.36},
 'cricket-white':     {dur:1.8,arc:.07,bounce:[1,.05],spin:{kind:'side',rate:6},fill:0.39,passX:.36},
 'baseball':          {dur:1.5,arc:.03,spin:{kind:'side',rate:12},fill:0.38,passX:.38},
 'softball':          {dur:1.6,arc:.05,spin:{kind:'side',rate:8},fill:0.38,passX:.38},
 'tennis':            {dur:1.7,arc:.14,bounce:[1,.07],spin:{kind:'side',rate:-6},fill:0.36,passX:.38},
 'table-tennis':      {dur:1.5,arc:.12,bounce:[1,.09],spin:{kind:'side',rate:9},fill:0.33,passX:.38},
 'golf':              {dur:2.7,arc:.50,spin:{kind:'side',rate:14},fill:0.30,passX:.40},
 'ice-hockey-puck':   {dur:1.6,arc:.01,bounce:[2,.015],spin:{kind:'flat',rate:6},fill:0.36,passX:.38},
};
export const SPORT_ALIASES={afl:'afl',footy:'afl',nrl:'rugby-league',league:'rugby-league',rugby:'rugby-union',union:'rugby-union',nfl:'american-football',football:'american-football',
 basket:'basketball',nba:'basketball',cricket:'cricket-red',bbl:'cricket-red',baseball:'baseball',mlb:'baseball',soccer:'soccer',epl:'soccer',tennis:'tennis',golf:'golf',volley:'volleyball',
 netball:'netball',waterpolo:'water-polo',hockey:'ice-hockey-puck',nhl:'ice-hockey-puck',puck:'ice-hockey-puck',pingpong:'table-tennis',softball:'softball'};
export const resolveSport=s=>SPORTS[s]?s:(SPORT_ALIASES[s]||'soccer');

// ---- helpers --------------------------------------------------------------------------------------------------------------------------------
const V=THREE.Vector3,Q=THREE.Quaternion,M4=THREE.Matrix4;
const UP=new V(0,1,0);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296;};

// Frustum description from ANY three camera (perspective or orthographic), evaluated now.
export function cameraFrame(cam){
 cam.updateMatrixWorld(true);const e=cam.matrixWorld.elements;
 const right=new V(e[0],e[1],e[2]).normalize(),up=new V(e[4],e[5],e[6]).normalize(),back=new V(e[8],e[9],e[10]).normalize();
 const pos=new V(e[12],e[13],e[14]),fwd=back.clone().negate();
 let hh,hw;
 if(cam.isOrthographicCamera){const z=cam.zoom||1;const H=(cam.top-cam.bottom)/2/z,W=(cam.right-cam.left)/2/z;hh=()=>H;hw=()=>W;}
 else{const tv=Math.tan(THREE.MathUtils.degToRad(cam.fov)/2)/(cam.zoom||1);const th=tv*(cam.aspect||1);hh=f=>f*tv;hw=f=>f*th;}
 return {pos,right,up,fwd,hh,hw,near:cam.near,far:cam.far,ortho:!!cam.isOrthographicCamera,hm:f=>Math.min(hw(f),hh(f))};
}
const toWorld=(F,x,y,f,out=new V())=>out.copy(F.pos).addScaledVector(F.right,x).addScaledVector(F.up,y).addScaledVector(F.fwd,f);

// Local sponsor-patch basis (normal + "image up") read from the ball's own geometry (node 'SponsorPatch' / material 'Sponsor').
function patchBasis(ball){
 let mesh=null;ball.traverse(o=>{if(o.isMesh&&(o.name==='SponsorPatch'||o.material?.name==='Sponsor'))mesh=mesh||o;});if(!mesh)return null;
 ball.updateMatrixWorld(true);const inv=new M4().copy(ball.matrixWorld).invert(),m=new M4().multiplyMatrices(inv,mesh.matrixWorld);
 const g=mesh.geometry,p=g.attributes.position,uv=g.attributes.uv,nrm=g.attributes.normal;if(!p||!uv)return null;
 const c=new V(),n=new V(),tmp=new V(),top=new V(),bot=new V();let nt=0,nb=0;const N=p.count;
 for(let i=0;i<N;i++){tmp.set(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(m);c.add(tmp);
  if(nrm){const t=new V(nrm.getX(i),nrm.getY(i),nrm.getZ(i)).transformDirection(m);n.add(t);}
  const v=uv.getY(i);if(v<.3){top.add(tmp);nt++;}else if(v>.7){bot.add(tmp);nb++;}}
 c.divideScalar(N);n.length()>1e-6?n.normalize():n.copy(c).normalize();
 let u=top.divideScalar(Math.max(nt,1)).sub(bot.divideScalar(Math.max(nb,1)));u.addScaledVector(n,-u.dot(n));if(u.lengthSq()<1e-10)u.set(0,1,0).addScaledVector(n,-n.y);u.normalize();
 return {n,u,mesh};
}
const basisQ=(a,b)=>{const c=new V().crossVectors(a,b);return new Q().setFromRotationMatrix(new M4().makeBasis(a,b,c));};

// ---- main ----------------------------------------------------------------------------------------------------------------------------------
export function startBallFlyby(o){
 const {scene,camera,ball,from,onDone}=o;const id=resolveSport(o.sport||'soccer'),P=SPORTS[id];
 const dur=o.duration??P.dur,scale=o.scale??4,faceSponsor=o.faceSponsor!==false;
 if(!ball.parent)scene.add(ball);ball.visible=true;
 // radius of the model in its own units (bounding sphere), measured once at scale 1
 ball.scale.setScalar(1);ball.quaternion.identity();ball.position.set(0,0,0);ball.updateMatrixWorld(true);
 const bb=new THREE.Box3().setFromObject(ball),rModel=(o.modelRadius??(bb.isEmpty()?0.1:bb.getBoundingSphere(new THREE.Sphere()).radius))||0.1;
 // sponsor: private material clone so the shared prototype stays clean
 if(o.sponsorTexture)applySponsorTexture(ball,o.sponsorTexture);
 const patch=(faceSponsor&&o.sponsorTexture)?patchBasis(ball):null;
 const S0=from.clone(),seed=hash(id+(o.seed??''));
 const q0=new Q().setFromAxisAngle(new V(seed,1-seed,.5).normalize(),seed*6.283);
 const st={minDistance:Infinity,frames:0,nudged:false,uPass:o.passAt??.78};
 const c={done:false,cancelled:false,t:0,duration:dur,sport:id,ball,stats:st,progress:0,params:P,camera,
  setCamera(cam){c.camera=cam;},
  cancel(){if(c.done)return;c.done=true;c.cancelled=true;ball.removeFromParent();onDone&&onDone(c);},
  update(dt){ if(c.done)return;c.t+=dt;const u=clamp(c.t/dur,0,1);c.progress=u;step(u,dt);if(u>=1){c.done=true;ball.removeFromParent();onDone&&onDone(c);}}};
 const vdir=new V(),Pprev=new V(),Pcur=new V(),Sv=new V(),Tp=new V(),Te=new V(),Sef=new V(),tmpv=new V();let first=true,rPassLast=0;
 function step(u,dt){
  const cam=c.camera,F=cameraFrame(cam),{near,far}=F;
  const dP=o.passDistance??Math.max(14*near,.6*scale);               // closest-pass depth along the view axis
  // --- start point: the play point, nudged into frame (and out of the near zone) if it is off-screen / behind / too close
  tmpv.subVectors(S0,F.pos);const sx=tmpv.dot(F.right),sy=tmpv.dot(F.up),sf=tmpv.dot(F.fwd);
  let f=sf,nx,ny;
  if(sf>near*2){nx=sx/F.hw(sf);ny=sy/F.hh(sf);}else{const h=Math.hypot(sx,sy)||1;nx=sx/h*.6;ny=sy/h*.5;f=Math.max(dP*2.5,near*3);}
  f=clamp(Math.max(f,dP*2.2),dP*2.2,Math.max(dP*2.3,far*.9));
  const cx=clamp(nx,-.78,.78),cy=clamp(ny,-.7,.7);
  if(f!==sf||cx!==nx||cy!==ny)st.nudged=true;
  toWorld(F,cx*F.hw(f),cy*F.hh(f),f,Sef);
  // --- pass point (beside the view axis, on the side the ball comes from) and exit point (behind / beside the camera)
  const side=Math.abs(cx)<.04?(seed>.5?1:-1):Math.sign(cx),px=side*P.passX,py=clamp(cy*.3,-.22,.22)-.05;
  toWorld(F,px*F.hw(dP),py*F.hh(dP),dP,Tp);
  const aP=P.fill,rPass=aP*F.hm(dP);
  if(F.ortho)toWorld(F,side*(F.hw(dP)+3*rPass),py*F.hh(dP),dP*.9,Te);else toWorld(F,side*(P.passX+.9)*F.hw(dP),py*F.hh(dP),-dP*1.2,Te);
  const up=Math.abs(F.up.y)>.05?UP:F.up;
  const uP=st.uPass;let pos=Pcur,r;
  if(u<uP){const g=u/uP,p1=g*(1.7-.7*g);pos.lerpVectors(Sef,Tp,p1);
   const L=Sef.distanceTo(Tp),H=P.arc*L;pos.addScaledVector(up,H*4*p1*(1-p1));
   if(P.bounce){const [n,bh]=P.bounce;pos.addScaledVector(up,bh*L*Math.abs(Math.sin(Math.PI*n*p1))*(1-p1));}
   // safety: keep the centre inside the frame (|NDC|<=.9) and in front of the near zone while approaching
   tmpv.subVectors(pos,F.pos);const x=tmpv.dot(F.right),y=tmpv.dot(F.up),ff=Math.max(tmpv.dot(F.fwd),near*1.5);
   const xx=clamp(x,-.9*F.hw(ff),.9*F.hw(ff)),yy=clamp(y,-.9*F.hh(ff),.9*F.hh(ff));toWorld(F,xx,yy,ff,pos);
   const aa=THREE.MathUtils.lerp(.08,aP,Math.pow(p1,1.5));r=Math.max(aa*F.hm(ff),0);rPassLast=r;
   // never smaller than the real ball in scene units
   r=Math.max(r,o.trueRadius??0);
  }else{const h=(u-uP)/(1-uP),p2=Math.pow(h,1.7);pos.lerpVectors(Tp,Te,p2);r=rPass*(1-.45*h);}
  // --- orientation
  let vd=tmpv.subVectors(pos,first?Sef:Pprev);if(vd.lengthSq()<1e-12)vd.subVectors(Tp,Sef);vd.normalize();if(first)vdir.copy(vd);else vdir.lerp(vd,clamp(dt*12,0,1)).normalize();
  const ang=Math.PI*2*P.spin.rate*c.t,sp=P.spin,q=new Q();
  if(sp.kind==='long'){const al=new Q().setFromUnitVectors(new V(1,0,0),vdir);const tw=new Q().setFromAxisAngle(new V(1,0,0),ang);
   const wb=new Q().setFromEuler(new THREE.Euler(0,Math.sin(c.t*9)*(P.wobble||0),Math.cos(c.t*9)*(P.wobble||0)));q.copy(al).multiply(wb).multiply(tw);}
  else if(sp.kind==='flat'){const tilt=new Q().setFromAxisAngle(new V().crossVectors(UP,vdir).normalize(),.18);q.copy(tilt).multiply(new Q().setFromAxisAngle(UP,ang));}
  else{const ax=sp.kind==='side'?new V().crossVectors(UP,vdir).normalize():sp.kind==='vert'?UP.clone():new V(...sp.axis).normalize();
   if(ax.lengthSq()<.5)ax.set(1,0,0);q.setFromAxisAngle(ax,ang).multiply(q0);}
  if(patch){const toCam=tmpv.subVectors(F.pos,pos).normalize().clone(),upP=F.up.clone().addScaledVector(toCam,-F.up.dot(toCam));
   if(upP.lengthSq()<1e-6)upP.copy(F.right);upP.normalize();
   const qf=basisQ(toCam,upP).multiply(basisQ(patch.n,patch.u).invert());
   const w=sstep(uP-.30,uP-.05,u)*(1-sstep(uP+.02,uP+.16,u));q.slerp(qf,w);}
  ball.position.copy(pos);ball.quaternion.copy(q);ball.scale.setScalar(Math.max(r,1e-4)/rModel);
  ball.updateMatrixWorld(true);
  const d=pos.distanceTo(F.pos);if(d<st.minDistance)st.minDistance=d;st.frames++;st.radius=r;
  Pprev.copy(pos);first=false;
 }
 c.radiusOf=()=>ball.scale.x*rModel;c.rModel=rModel;c.passDistance=()=>o.passDistance??Math.max(14*camera.near,.6*scale);
 step(0,1/60);// place immediately so frame 0 is already valid
 return c;
}

// Sponsor helpers ------------------------------------------------------------------------------------------------------------------------------
export function applySponsorTexture(ball,tex){
 tex.flipY=false;tex.colorSpace=THREE.SRGBColorSpace;tex.needsUpdate=true;
 ball.traverse(m=>{if(m.isMesh&&m.material?.name==='Sponsor'){const mt=m.material.clone();mt.name='Sponsor';mt.map=tex;mt.color.set(0xffffff);mt.transparent=true;mt.opacity=1;mt.depthWrite=false;mt.polygonOffset=true;mt.polygonOffsetFactor=-2;mt.needsUpdate=true;m.material=mt;}});
}
// Load a ball GLB by manifest id: const {object,entry}=await loadBall('soccer','../balls'); then pass object.clone(true) as `ball`.
export async function loadBall(id,baseUrl='../balls',manifest=null){
 const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('./loaders/GLTFLoader.js'),import('./libs/meshopt_decoder.module.js')]);
 manifest=manifest||await (await fetch(baseUrl+'/manifest.json')).json();
 const entry=manifest.find(b=>b.id===resolveSport(id))||manifest.find(b=>b.id===id);if(!entry)throw new Error('no ball '+id);
 const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(baseUrl+'/glb/'+entry.file);
 g.scene.name='ball-'+entry.id;g.scene.userData.entry=entry;return {object:g.scene,entry,manifest};
}
