export async function copyPngOnTab(tabId, pngDataUrl) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    },
    args: [pngDataUrl],
  });
}
