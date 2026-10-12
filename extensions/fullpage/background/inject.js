const PAGE_TOOLS = 'content/page-tools.js';

export async function ensurePageTools(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [PAGE_TOOLS],
  });
}

export async function callPageTool(tabId, method, args = []) {
  await ensurePageTools(tabId);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (name, methodArgs) => {
      const api = globalThis.__NeillFullPageTools;
      if (!api || typeof api[name] !== 'function') {
        throw new Error(`Unknown page tool: ${name}`);
      }
      return api[name](...methodArgs);
    },
    args: [method, args],
  });
  return result;
}
