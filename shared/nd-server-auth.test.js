const assert = require('node:assert/strict');
const { createServerAuth } = require('./nd-auth.js');
(async () => {
  const store = new Map([['nd.auth.planner.session.v1', 'device-session']]);
  let now = 100000, calls = [], failLogout = false, events = [], tokenNumber = 0;
  const deps = {
    storage: { get: k => store.get(k), set: (k,v) => store.set(k,v), remove: k => store.delete(k) },
    now: () => now, setTimer: () => 1, clearTimer() {},
    serverPost: async (_, body) => {
      calls.push(body);
      if (body.action === 'planner_oauth_logout') { if (failLogout) throw Error('offline'); return {ok:true}; }
      return { access_token: 'access-'+(++tokenNumber), expiry: now+3600000, email: 'test@example.com', profile: {email:'test@example.com'}, scopes: [] };
    }
  };
  const a = createServerAuth(deps).init({serverEndpoint:'https://example.invalid'});
  a.onAuthChange(e => events.push(e.type));
  assert.equal(a.isSignedIn(),false);
  const [one,two] = await Promise.all([a.ensureToken(),a.ensureToken()]);
  assert.equal(one,two); assert.equal(calls.length,1); assert.equal(events[0],'signin');
  await a.ensureToken(); assert.equal(calls.length,1);
  now += 3500000; await a.ensureToken(); assert.equal(calls.length,2);
  assert.equal(events[1],'refresh');
  now += 3*86400000;
  const reopened = createServerAuth(deps).init({serverEndpoint:'https://example.invalid'});
  await reopened.ensureToken(); assert.equal(reopened.isSignedIn(),true);
  // Offline sign-out: the device is signed out at once; the server delete is queued and retried on next start.
  failLogout = true; const out = await reopened.signOut();
  assert.equal(out.serverDone,false);
  assert.equal(store.has('nd.auth.planner.session.v1'),false);
  assert.equal(store.has('nd.auth.token.v1'),false);
  assert.match(store.get('nd.auth.planner.logout.v1'),/device-session/);
  failLogout = false; createServerAuth(deps).init({serverEndpoint:'https://example.invalid'});
  await new Promise(r => setImmediate(r));
  assert.equal(store.has('nd.auth.planner.logout.v1'),false);
  assert.equal(calls.filter(c => c.action==='planner_oauth_logout').length,2);
  await assert.rejects(reopened.ensureToken(),/Sign in/);
  console.log('Server auth: resume, single-flight, refresh, reopen and logout tests passed');
})().catch(e => { console.error(e); process.exitCode=1; });
