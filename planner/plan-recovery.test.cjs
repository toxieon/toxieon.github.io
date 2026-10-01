const test=require('node:test'),assert=require('node:assert/strict');
const {section,context}=require('./test-utils.cjs');
const source=section('function resolveFloorPlanFiles(','async function reloadMasterData(');
function harness(){
 const floor={id:'f',name:'Ground',planDriveFileId:'pdf',planPngFileId:'png'};const calls=[];
 const state={projects:[{id:'p',name:'Job',floors:[floor]}],floorPlans:{f:'old'}};
 const c=context(source,{state,_planLinking:{},_planFetchError:{},persist(){},describeError:e=>e.message,
  existingFloorPlanFolder:async()=>'folder',listFloorPlanFiles:async()=>[],
  fetchDriveFileAsDataUrl:async(id,options)=>{calls.push([id,options]);return 'fresh:'+id;}});
 c.replaceFloorPlanCache=async(f,url)=>{state.floorPlans[f.id]=url;};
 return {c,state,floor,calls};
}
test('explicit reload fetches fresh bytes even when the same Drive ID is already cached',async()=>{
 const {c,state,calls}=harness();const result=await c.refreshFloorPlansFromDrive();
 assert.equal(result.refreshed,1);assert.equal(state.floorPlans.f,'fresh:pdf');assert.equal(calls[0][1].fresh,true);
});
test('unlinked originals are discovered by known file names; arbitrary PDFs are not guessed',()=>{
 const {c}=harness();let r=c.resolveFloorPlanFiles({},[{id:'a',name:'invoice.pdf',mimeType:'application/pdf'}]);assert.equal(r.original,null);
 r=c.resolveFloorPlanFiles({},[{id:'a',name:'floor-plan-ground.pdf',mimeType:'application/pdf',modifiedTime:'2026-10-01'},{id:'b',name:'floor-plan-render.png',mimeType:'image/png'}]);assert.equal(r.original.id,'a');assert.equal(r.png.id,'b');
 const tie=c.resolveFloorPlanFiles({},[{id:'a',name:'floor-plan-a.pdf',modifiedTime:'same'},{id:'b',name:'floor-plan-b.pdf',modifiedTime:'same'}]);assert.equal(tie.ambiguous,true);assert.equal(tie.original,null);
});
test('failed original rendering tries the associated PNG; total failure keeps the cached plan',async()=>{
 const {c,state,calls}=harness();c.replaceFloorPlanCache=async(f,source)=>{if(source==='fresh:pdf')throw Error('Bad PDF');state.floorPlans[f.id]=source;};
 let r=await c.refreshFloorPlansFromDrive();assert.equal(r.refreshed,1);assert.equal(state.floorPlans.f,'fresh:png');assert.equal(calls.length,2);
 state.floorPlans.f='working';c.fetchDriveFileAsDataUrl=async()=>{throw Error('offline');};
 r=await c.refreshFloorPlansFromDrive();assert.equal(r.failed,1);assert.equal(state.floorPlans.f,'working');
});
test('reload does not overwrite a pending local replacement or reinstate an explicitly removed local plan',async()=>{
 const {c,state,floor,calls}=harness();floor.planPendingUpload=true;
 let r=await c.refreshFloorPlansFromDrive();assert.equal(r.preserved,1);assert.equal(calls.length,0);assert.equal(state.floorPlans.f,'old');
 floor.planPendingUpload=false;floor.planDriveFileId=floor.planPngFileId=null;floor.planRecoveryDisabled=true;
 r=await c.refreshFloorPlansFromDrive();assert.equal(r.refreshed,0);assert.equal(calls.length,0);
});
test('pending device-only floors, room geometry and nodes survive a cloud hydration rebuild',()=>{
 const state={projects:[],nodes:[],rooms:[],drive:{projectFolderMap:{},floorFolderMap:{}}};
 const c=context(section('function restorePendingDevicePlans(','async function hydrateFromMasterSheet('),{state});
 c.restorePendingDevicePlans([{project:{id:'p',name:'Local'},floor:{id:'f',planPendingUpload:true},nodes:[{id:'n',floorId:'f'}],rooms:[{id:'r',floorId:'f',shape:{type:'poly',pts:[[0,0],[1,0],[1,1]]}}],projectFolderId:'pd',floorFolderId:'fd'}]);
 assert.equal(state.projects[0].floors[0].planPendingUpload,true);assert.equal(state.nodes[0].id,'n');assert.equal(state.rooms[0].id,'r');assert.equal(state.drive.floorFolderMap.f,'fd');
});
test('failed cache preparation leaves all current plan bytes and links intact',async()=>{
 const {c,state,floor}=harness();const old=JSON.stringify(floor);
 c.normalizePdfDataUrl=x=>x;c.pdfFirstPageToPng=async()=>{throw Error('Cannot render');};
 // Re-load the real preparation function after the orchestration harness override.
 const real=context(section('async function replaceFloorPlanCache(','async function refreshFloorPlansFromDrive('),{state,normalizePdfDataUrl:x=>x,pdfFirstPageToPng:c.pdfFirstPageToPng});
 await assert.rejects(real.replaceFloorPlanCache(floor,'data:application/pdf;base64,AA=='),/Cannot render/);
 assert.equal(state.floorPlans.f,'old');assert.equal(JSON.stringify(floor),old);
});
