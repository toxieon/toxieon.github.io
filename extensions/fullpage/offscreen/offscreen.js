import { PDFDocument, StandardFonts, rgb } from '../vendor/pdf-lib.esm.min.js';

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

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
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

  const overlapDpr = Math.round((overlapCss || 0) * dpr);

  for (let i = 0; i < slices.length; i++) {
    const { dataUrl, scrollY } = slices[i];
    const img = await loadImage(dataUrl);
    const destY = Math.round(scrollY * dpr);
    let srcY = 0;
    if (i > 0 && overlapDpr > 0) srcY = overlapDpr;
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
  return pdf.output('blob');
}

async function verticalStackPng(pngDataUrls) {
  const images = await Promise.all(pngDataUrls.map((u) => loadImage(u)));
  const width = Math.max(...images.map((im) => im.width));
  let height = 0;
  for (const im of images) height += im.height;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const im of images) {
    ctx.drawImage(im, 0, y);
    y += im.height;
  }
  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const pngDataUrl = await blobToDataUrl(pngBlob);
  return { pngDataUrl, width, height };
}

async function searchableImagePdf(pngDataUrl, textLayer, metrics, title) {
  const pngBytes = dataUrlToBytes(pngDataUrl);
  const pdfDoc = await PDFDocument.create();
  const embedded = await pdfDoc.embedPng(pngBytes);
  const pxToPt = 72 / 96;
  const cssW = textLayer?.pageWidth || metrics.width;
  const cssH = textLayer?.pageHeight || metrics.height;
  const wPt = cssW * pxToPt;
  const hPt = cssH * pxToPt;
  const page = pdfDoc.addPage([wPt, hPt]);
  page.drawImage(embedded, { x: 0, y: 0, width: wPt, height: hPt });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const scale = wPt / cssW;
  for (const item of textLayer?.items || []) {
    const text = String(item.text || '').trim();
    if (!text) continue;
    const fontSize = Math.max(5, item.height * scale * 0.85);
    const x = item.left * scale;
    const y = hPt - (item.top + item.height) * scale;
    try {
      page.drawText(text.slice(0, 500), {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(1, 1, 1),
        opacity: 0.02,
      });
    } catch {
      /* skip unencodable glyphs */
    }
  }
  if (title) pdfDoc.setTitle(title);
  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: 'application/pdf' });
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
      case 'searchableImagePdf': {
        const blob = await searchableImagePdf(
          message.pngDataUrl,
          message.textLayer,
          message.metrics,
          message.title
        );
        sendResponse({ ok: true, blob: await blobToDataUrl(blob) });
        break;
      }
      case 'htmlPdf': {
        const blob = await htmlToSearchablePdf(message.html, message.title, message.meta);
        sendResponse({ ok: true, blob: await blobToDataUrl(blob) });
        break;
      }
      case 'verticalStackPng': {
        const result = await verticalStackPng(message.pngDataUrls || []);
        sendResponse({ ok: true, result });
        break;
      }
      default:
        sendResponse({ ok: false, error: 'unknown action' });
    }
  })().catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true;
});
