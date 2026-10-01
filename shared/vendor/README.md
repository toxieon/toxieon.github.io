# shared/vendor: third-party code (unmodified upstream builds)

| Folder / file | Library | Version | Licence | Source |
|---|---|---|---|---|
| exifr.umd.js | exifr | 7.1.3 (dist/full.umd.js) | MIT (exifr.LICENSE) | npm exifr |
| pdfjs/ | pdf.js (pdfjs-dist, **legacy** build for older iOS Safari) | 6.3.289 | Apache-2.0 (LICENSE). wasm/ decoders: BSD-2 (OpenJPEG), BSD-3 (PDFium JBIG2), MIT (qcms), Apache-2.0/BSD-2 (pdf.js glue); see wasm/LICENSE_*. iccs/: CC0-1.0 | npm pdfjs-dist |
| html2canvas-pro/ | html2canvas-pro | 2.5.0 | MIT (LICENSE) | npm html2canvas-pro |
| jspdf/ | jsPDF | 2.5.1 (identical to the cdnjs file previously used) | MIT (LICENSE) | npm jspdf |
| sheetjs/ | SheetJS Community Edition xlsx.full.min.js | 0.20.3 | Apache-2.0 (LICENSE) | https://cdn.sheetjs.com/xlsx-0.20.3/ |
| papaparse/ | Papa Parse | 5.7.0 | MIT (LICENSE) | npm papaparse |
| pica/ | pica (full build, inline worker) | 10.0.3 | MIT (LICENSE) | npm pica |

Load pdf.js through `shared/nd-pdf.js` (NDPdf.load / NDPdf.docOptions), which also sets the worker, wasm and icc URLs plus isEvalSupported:false.
CSV goes through `shared/nd-csv.js` (NDCSV.rows) and photo downscales through `shared/nd-resize.js` (NDResize.toCanvas).
