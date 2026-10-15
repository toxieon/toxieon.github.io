const PAGE_TOOLS = 'content/page-tools.js';

function formatInjectionError(err, tabId) {
  const msg = err?.message || String(err);
  if (/cannot access|Cannot access|extensions gallery/i.test(msg)) {
    return `Cannot inject into this page. Try a normal https:// tab (not Chrome Web Store or another extension).`;
  }
  if (/No tab with id|Invalid tab/.test(msg)) {
    return 'The capture tab was closed or changed during capture.';
  }
  return `Page injection failed (tab ${tabId}): ${msg}`;
}

export async function ensurePageTools(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [PAGE_TOOLS],
    });
  } catch (err) {
    throw new Error(formatInjectionError(err, tabId));
  }
}

export async function callPageTool(tabId, method, args = []) {
  await ensurePageTools(tabId);
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: async (name, methodArgs) => {
        const api = globalThis.__NeillFullPageTools;
        if (!api || typeof api[name] !== 'function') {
          throw new Error(`Unknown page tool: ${name}`);
        }
        return await api[name](...methodArgs);
      },
      args: [method, args],
    });
  } catch (err) {
    throw new Error(formatInjectionError(err, tabId));
  }
  const frame = results?.[0];
  if (!frame) {
    throw new Error('No result from page script (page may block extension scripts).');
  }
  if (frame.error) {
    throw new Error(frame.error.message || String(frame.error));
  }
  return frame.result;
}
