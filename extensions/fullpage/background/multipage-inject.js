const WIDGET_JS = 'content/multipage-widget.js';
const WIDGET_CSS = 'content/multipage-widget.css';

export async function injectMultipageWidget(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: [WIDGET_CSS] });
  } catch {
    /* */
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: [WIDGET_JS],
    });
  } catch {
    /* restricted */
  }
}

export async function removeMultipageWidgetFromAllTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'MULTIPAGE_REMOVE_WIDGET' });
    } catch {
      /* */
    }
  }
}
