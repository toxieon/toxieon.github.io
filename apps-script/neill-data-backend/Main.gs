/* Router. Every request is POST text/plain JSON (no CORS preflight). */

function doGet() {
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
