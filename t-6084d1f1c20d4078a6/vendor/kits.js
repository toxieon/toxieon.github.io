// Kit recolouring for players-v2 (drop-in superset of ../players/kits.js).
// GLB material names: skin, jumper, shorts, socks, sockTop, boots, hair, trim (collar + sleeve hems), sponsor (chest decal, alpha 0 until a texture is set).
// Skinned rig => clone with SkeletonUtils (loadPlayerV2 below patches scene.clone so existing v5.js createMatch() works unchanged).
import * as T from './three.module.min.js';
import {MeshoptDecoder} from './libs/meshopt_decoder.module.js';
import {GLTFLoader} from './loaders/GLTFLoader.js';
import * as SU from './utils/SkeletonUtils.js';
function patternTexture(j){
 if(j.texture){const t=new T.TextureLoader().load(j.texture);t.colorSpace=T.SRGBColorSpace;t.flipY=false;return t;}
 const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const [a,b]=j.colors,n=j.bands||8;
 x.fillStyle=a;x.fillRect(0,0,256,256);
 if(j.pattern==='stripes'){const sh=((n*0.5)%1===0?0.5:0)*256/n; // centre the front chest (u=0.5) on a bar
  for(let i=-1;i<=n;i+=2){x.fillStyle=b;x.fillRect(i*256/n+sh,0,256/n,256);}}
 else if(j.pattern==='hoops'){for(let i=1;i<n;i+=2){x.fillStyle=b;x.fillRect(0,i*256/n,256,256/n);}}
 else if(j.pattern==='sash'){x.fillStyle=b;x.beginPath();x.moveTo(0,0);x.lineTo(110,0);x.lineTo(256,256);x.lineTo(146,256);x.fill();}
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;t.flipY=false;return t;}
export function kitMaterials(base,kit){const src={};base.traverse(o=>{if(o.isMesh)src[o.material.name]=o.material;});const m={};
 for(const [n,mat] of Object.entries(src))m[n]=mat.clone();
 m.jumper.map=patternTexture(kit.jumper);m.jumper.color.set(0xffffff);
 m.shorts.color.set(kit.shorts);m.socks.color.set(kit.socks.base);m.sockTop.color.set(kit.socks.top??kit.socks.base);
 if(m.trim)m.trim.color.set(kit.trim??kit.jumper.colors?.[1]??'#ffffff');
 if(kit.boots)m.boots.color.set(kit.boots);if(kit.skin)m.skin.color.set(kit.skin);if(kit.hair)m.hair.color.set(kit.hair);
 if(m.sponsor&&kit.sponsor){const t=new T.TextureLoader().load(kit.sponsor);t.colorSpace=T.SRGBColorSpace;t.flipY=false;m.sponsor.map=t;m.sponsor.color.set(0xffffff);m.sponsor.opacity=1;m.sponsor.alphaTest=0.5;}
 Object.values(m).forEach(x=>x.needsUpdate=true);return m;}
export function dressedPlayer(base,mats){const p=SU.clone(base);p.traverse(o=>{if(o.isMesh){o.material=mats[o.material.name]||o.material;o.castShadow=true;}});return p;}
// Load a players-v2 GLB. Returns {scene, animations}; scene.clone() is SkeletonUtils.clone so v5.js (base.clone(true)) keeps working.
export async function loadPlayerV2(url='players-v2/player-v2.glb'){
 const g=await new Promise((a,e)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(url,a,null,e));
 const s=g.scene;const patched=function(){delete s.clone;const c=SU.clone(s);s.clone=patched;return c;};s.clone=patched;s.traverse(o=>{if(o.isSkinnedMesh)o.frustumCulled=false;});return g;}
