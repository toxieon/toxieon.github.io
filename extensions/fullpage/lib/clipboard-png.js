export async function copyPngDataUrlToClipboard(pngDataUrl) {
  if (!pngDataUrl?.startsWith('data:image/')) {
    throw new Error('Invalid PNG data');
  }
  const res = await fetch(pngDataUrl);
  const blob = await res.blob();
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}
