const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
let now=1000000, refreshes=0, invalidGrant=false;
const values=new Map([['PLANNER_OAUTH_CLIENT_ID','test-client'],['PLANNER_OAUTH_CLIENT_SECRET','test-secret'],['PLANNER_OAUTH_REDIRECT_URI','https://script.google.com/macros/s/test/exec']]);
const properties={getProperty:k=>values.get(k)||null,setProperty:(k,v)=>values.set(k,v),deleteProperty:k=>values.delete(k),getProperties:()=>Object.fromEntries(values)};
const ctx=vm.createContext({console,PROP:{pepper:'pepper'},Date:{now:()=>now},Math,JSON,
 PropertiesService:{getScriptProperties:()=>properties},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},getUuid:()=>crypto.randomUUID(),computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest())},
 HtmlService:{createHtmlOutput:s=>s},
 UrlFetchApp:{fetch:(url,opts)=>{
  const refresh=opts.payload?.grant_type==='refresh_token';if(refresh)refreshes++;
  const data=url.includes('userinfo')?{sub:'user1',email:'test@example.com',email_verified:true,name:'Tester'}:invalidGrant&&refresh?{error:'invalid_grant'}:{access_token:'access-'+refreshes,expires_in:3600,refresh_token:'server-only-refresh',scope:'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets'};
  return {getResponseCode:()=>invalidGrant&&refresh?400:200,getContentText:()=>JSON.stringify(data)};
 }}
});
for(const f of ['Auth.gs','PlannerOAuth.gs'])vm.runInContext(fs.readFileSync(__dirname+'/'+f,'utf8'),ctx);
const verifier='a'.repeat(64), challenge=ctx.sha256Hex_(verifier);
assert.equal(ctx.plannerOAuthStart_({challenge:'bad'}).error,'bad_challenge');
const start=ctx.plannerOAuthStart_({challenge});assert.ok(start.url.includes('access_type=offline'));
assert.equal(ctx.plannerOAuthClaim_({state:start.state,verifier:'b'.repeat(64)}).error,'login_expired');
assert.equal(ctx.plannerOAuthClaim_({state:start.state,verifier}).pending,true);
ctx.plannerOAuthCallback_({state:start.state,code:'authorization-code'});
assert.ok(ctx.plannerOAuthCallback_({state:start.state,code:'replay'}).includes('expired'));
const claim=ctx.plannerOAuthClaim_({state:start.state,verifier});assert.equal(claim.session.length,64);
assert.equal(ctx.plannerOAuthClaim_({state:start.state,verifier}).session,claim.session);
let response=ctx.plannerOAuthToken_({session:claim.session});
assert.equal(response.access_token,'access-0');assert.equal(JSON.stringify(response).includes('server-only-refresh'),false);assert.equal(JSON.stringify(response).includes('test-secret'),false);
now+=3700000;response=ctx.plannerOAuthToken_({session:claim.session});assert.equal(refreshes,1);assert.equal(response.access_token,'access-1');
const second=ctx.plannerOAuthStart_({challenge});ctx.plannerOAuthCallback_({state:second.state,code:'second'});const other=ctx.plannerOAuthClaim_({state:second.state,verifier});
ctx.plannerOAuthLogout_({session:claim.session});assert.equal(ctx.plannerOAuthToken_({session:claim.session}).error,'session_expired');assert.equal(ctx.plannerOAuthToken_({session:other.session}).ok,true);
invalidGrant=true;assert.equal(ctx.plannerOAuthToken_({session:other.session,force:true}).error,'session_expired');assert.equal(ctx.getSession_('planner',other.session),null);
const expired=ctx.plannerOAuthStart_({challenge});now+=600001;assert.equal(ctx.plannerOAuthClaim_({state:expired.state,verifier}).error,'login_expired');
console.log('Backend OAuth tests passed: state/claim binding, replay, private credentials, refresh, device logout, expiry and revoked grants');
