const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function stitchSlices(payload) {
  const { slices, metrics, overlapCss } = payload;
  const dpr = metrics.devicePixelRatio || 1;
  const pageWidth = Math.round(metrics.width * dpr);
  const pageHeight = Math.round(metrics.height * dpr);
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pageWidth, pageHeight);

  const sliceCssHeight = metrics.viewportHeight;
  const overlapDpr = Math.round((overlapCss || 0) * dpr);

  for (let i = 0; i < slices.length; i++) {
    const { dataUrl, scrollY } = slices[i];
    const img = await loadImage(dataUrl);
    const destY = Math.round(scrollY * dpr);
    let srcY = 0;
    if (i > 0 && overlapDpr > 0) {
      srcY = overlapDpr;
    }
    const srcH = img.height - srcY;
    const destH = Math.min(srcH, pageHeight - destY);
    if (destH <= 0) continue;
    ctx.drawImage(img, 0, srcY, img.width, destH, 0, destY, pageWidth, destH);
  }

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const pngDataUrl = await blobToDataUrl(pngBlob);
  return { pngBlob, pngDataUrl, width: pageWidth, height: pageHeight };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function stripHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body?.innerText || '';
}

async function htmlToSearchablePdf(html, title, meta = {}) {
  const { jsPDF } = globalThis.jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const lineHeight = 14;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(title || 'Capture', margin, margin);
  let y = margin + 24;
  const text = stripHtml(html);
  const lines = pdf.splitTextToSize(text, pageWidth);
  for (const line of lines) {
    if (y > pdf.internal.pageSize.getHeight() - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }
  if (meta.url) {
    pdf.setFontSize(9);
    pdf.text(meta.url, margin, pdf.internal.pageSize.getHeight() - margin);
  }
  const blob = pdf.output('blob');
  return blob;
}

async function imageToPdf(pngDataUrl, title, metrics) {
  const { jsPDF } = globalThis.jspdf;
  const img = await loadImage(pngDataUrl);
  const pxToPt = 72 / 96;
  const wPt = img.width * pxToPt;
  const hPt = img.height * pxToPt;
  const orientation = wPt > hPt ? 'l' : 'p';
  const pdf = new jsPDF({ orientation, unit: 'pt', format: [wPt, hPt] });
  pdf.addImage(pngDataUrl, 'PNG', 0, 0, wPt, hPt);
  if (title) {
    pdf.setProperties({ title });
  }
  return pdf.output('blob');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  (async () => {
    switch (message.action) {
      case 'stitch': {
        const result = await stitchSlices(message.payload);
        sendResponse({ ok: true, result });
        break;
      }
      case 'imagePdf': {
        const blob = await imageToPdf(message.pngDataUrl, message.title, message.metrics);
        sendResponse({ ok: true, blob: await blobToDataUrl(blob) });
        break;
      }
      case 'htmlPdf': {
        const blob = await htmlToSearchablePdf(message.html, message.title, message.meta);
        sendResponse({ ok: true, blob: await blobToDataUrl(blob) });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown action' });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
