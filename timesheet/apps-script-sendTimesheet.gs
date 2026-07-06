/**
 * Neill Data Timesheet backend — sendTimesheet action (handoff §3.4).
 *
 * DEPLOY (Brandon):
 * 1. Open the existing Apps Script project that serves the Quote backend
 *    (the /macros/s/AKfycb...xM/exec deployment).
 * 2. Paste this file in as a new script file (or merge the doPost branch
 *    into the existing doPost).
 * 3. Deploy > Manage deployments > Edit > New version. The URL stays the
 *    same, so the app needs no change.
 *
 * The app POSTs text/plain JSON: {action:'sendTimesheet', to, cc, subject, body}
 * and expects JSON back: {ok:true} or {ok:false, error:"..."}.
 */

function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (payload.action === "sendTimesheet") return handleSendTimesheet_(payload);
    // ...existing actions continue below/elsewhere...
    return json_({ ok: false, error: "Unknown action: " + payload.action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function handleSendTimesheet_(p) {
  if (!p.to) return json_({ ok: false, error: "Missing recipient" });
  if (!p.subject || !p.body) return json_({ ok: false, error: "Missing subject/body" });
  var options = { name: "Neill Data Timesheet" };
  if (p.cc) options.cc = p.cc;
  // Plain-text body from the app's buildEmail(); htmlBody kept simple so the
  // email reads identically to the old mailto: path.
  options.htmlBody = "<pre style=\"font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px\">" +
    escapeHtml_(p.body) + "</pre>";
  MailApp.sendEmail(p.to, p.subject, p.body, options);
  return json_({ ok: true, sentAt: new Date().toISOString() });
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
