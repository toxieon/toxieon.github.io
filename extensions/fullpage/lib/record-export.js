import {
  applyRedactionsToHtml,
  applyRedactionsToPageText,
  applyRedactionsToTextLayer,
} from './redact.js';

export function withRedactions(record) {
  const reds = record.redactions || [];
  if (!reds.length) return record;
  const textLayer = applyRedactionsToTextLayer(record.textLayer, reds);
  return {
    ...record,
    textLayer,
    pageText: applyRedactionsToPageText(record.pageText, record.textLayer, reds),
    html: record.html ? applyRedactionsToHtml(record.html, reds) : record.html,
  };
}
