/* Router. Every request is POST text/plain JSON (no CORS preflight). */

function doGet(e) {
  if (e && e.parameter && e.parameter.state) return plannerOAuthCallback_(e.parameter);
  // Setup check Brandon can open in a browser: <exec URL>?action=planner_oauth_status
  if (e && e.parameter && e.parameter.action === 'planner_oauth_status') return json_(plannerOAuthStatus_());
  return json_({ ok: true, msg: 'Neill Data backend. POST to use.' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}') || {}; }
  catch (err) { return json_({ error: 'bad request' }); }
  try {
    return json_(route_(body));
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ error: 'server error' });
  }
}

function route_(body) {
  const action = String(body.action || '');
  switch (action) {
    case 'planner_oauth_status': return plannerOAuthStatus_();
    case 'planner_oauth_start': return plannerOAuthStart_(body);
    case 'planner_oauth_claim': return plannerOAuthClaim_(body);
    case 'planner_oauth_token': return plannerOAuthToken_(body);
    case 'planner_oauth_logout': return plannerOAuthLogout_(body);
    // public
    case 'get_config': return getConfig_();
    case 'login':      return quoteLogin_(body);
    case 'tsl_login':  return tslLogin_(body);
    case 'tsl_get':    return tslGet_(body);
    case 'tsl_logout': return tslLogout_(body);
  }
  if (!QUOTE_ACTIONS[action]) return { error: 'unknown action: ' + action };
  const ctx = authQuote_(body);
  if (ctx.denied) return ctx.denied;
  return QUOTE_ACTIONS[action](body, ctx);
}

/** Public: lets the pages find the price sheet without hard-coding it. */
function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    version: BACKEND_VERSION,
    priceSheetId: props.getProperty(PROP.priceSheet) || '',
    requireUsername: props.getProperty(PROP.requireUsername) === 'true'
  };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
