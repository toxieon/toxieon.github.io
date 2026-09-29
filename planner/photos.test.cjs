const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const {section,context} = require('./test-utils.cjs');
(async () => {
  let searches=0, creates=0;
  const ctx=context(section('const folderRequests =','// Alias for backward'), {
    findChildFolder: async () => { searches++; await Promise.resolve(); return null; },
    gapi:{client:{drive:{files:{create: async () => {creates++;return {result:{id:'folder'}};}}}}}
  });
  assert.deepEqual(await Promise.all([ctx.findOrCreateChildFolder('node','floor'),ctx.findOrCreateChildFolder('node','floor')]),['folder','folder']);
  assert.equal(searches,1);assert.equal(creates,1);
  let refreshes=0, sent=0, generated=0;
  const upload=context(section('const uploadFileIds =','async function updateFileBytes'),{
    WeakMap, Blob, NDAuth:{ensureToken:async () => {refreshes++; return 'token';}},
    googleCall: async fn => fn(),
    gapi:{client:{drive:{files:{generateIds:async () => {generated++;return {result:{ids:['same-id']}};},get:async () => ({result:{id:'same-id'}})}}}},
    fetch: async (_,req) => { sent++; assert.equal(req.headers.Authorization,'Bearer token');assert.equal(await req.body.text().then(s=>s.includes('photo bytes')),true);return {status:409}; }
  });
  const file = new Blob(['photo bytes'],{type:'image/jpeg'});file.name='photo.jpg';
  await upload.uploadFileToDrive(file,'folder');await upload.uploadFileToDrive(file,'folder');
  assert.equal(generated,1);assert.equal(sent,2);assert.equal(refreshes,4);
  const node={id:'n',projectId:'p',imageRefs:[]}; let uploads=0;
  const q=context(fs.readFileSync(__dirname+'/photos.js','utf8'),{
    document:{addEventListener(){}},window:{addEventListener(){}},
    state:{nodes:[node],googleAuth:{profile:{email:'test'}}},NDAuth:{ensureToken:async()=>{}},
    projectById:()=>({id:'p'}),ensureNodeDriveFolder:async()=> 'folder',
    uploadFileToDrive:async()=>{uploads++; if(uploads===2) throw Error('network');return {id:'image-'+uploads};},
    render(){},persist(){},logAudit(){},describeError:e=>e.message,nowStamp:()=>'',
  });
  vm.runInContext(`preparePlannerPhoto = async job => job.file; for(let i=0;i<20;i++) photoJobs.push({id:String(i),nodeId:'n',projectId:'p',file:{name:'p.jpg'},status:'queued'});`,q);
  await q.runPlannerPhotoQueue();
  assert.equal(node.imageRefs.length,19);
  vm.runInContext(`photoJobs.find(j=>j.status==='failed').status='queued'`,q);
  await q.runPlannerPhotoQueue();assert.equal(node.imageRefs.length,20);
  console.log('Photo tests passed: concurrent folder requests, idempotent retry, token refresh, 20-file queue with one injected failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
