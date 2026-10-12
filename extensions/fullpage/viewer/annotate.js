/**
 * Simple screenshot annotation (pen, highlight, arrow, text).
 */
export function createAnnotator(container, imageEl, onSave) {
  const wrap = document.createElement('div');
  wrap.className = 'annotate-wrap';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  wrap.appendChild(imageEl);
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  let drawing = false;
  let tool = 'pen';
  let strokes = [];
  let current = null;
  let scale = 1;

  function resize() {
    const rect = imageEl.getBoundingClientRect();
    scale = imageEl.naturalWidth / rect.width;
    canvas.width = rect.width;
    canvas.height = rect.height;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    redraw();
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = [...strokes];
    if (current) all.push(current);
    for (const s of all) drawStroke(ctx, s, 1);
  }

  function drawStroke(context, stroke, invScale) {
    const sc = invScale;
    context.save();
    if (stroke.tool === 'highlight') {
      context.globalAlpha = 0.35;
      context.strokeStyle = '#ffeb3b';
      context.lineWidth = 16 * sc;
    } else if (stroke.tool === 'pen') {
      context.strokeStyle = '#e53935';
      context.lineWidth = 3 * sc;
    } else if (stroke.tool === 'arrow') {
      context.strokeStyle = '#e53935';
      context.fillStyle = '#e53935';
      context.lineWidth = 3 * sc;
    } else if (stroke.tool === 'text') {
      context.fillStyle = '#e53935';
      context.font = `${16 * sc}px system-ui,sans-serif`;
      context.fillText(stroke.text, stroke.x * sc, stroke.y * sc);
      context.restore();
      return;
    }
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (stroke.tool === 'arrow' && stroke.points.length >= 2) {
      const a = stroke.points[0];
      const b = stroke.points[stroke.points.length - 1];
      context.beginPath();
      context.moveTo(a.x * sc, a.y * sc);
      context.lineTo(b.x * sc, b.y * sc);
      context.stroke();
      drawArrowHead(context, a.x * sc, a.y * sc, b.x * sc, b.y * sc);
    } else if (stroke.points?.length) {
      context.beginPath();
      context.moveTo(stroke.points[0].x * sc, stroke.points[0].y * sc);
      for (let i = 1; i < stroke.points.length; i++) {
        context.lineTo(stroke.points[i].x * sc, stroke.points[i].y * sc);
      }
      context.stroke();
    }
    context.restore();
  }

  function drawArrowHead(context, x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 10;
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - len * Math.cos(angle - 0.4), y2 - len * Math.sin(angle - 0.4));
    context.lineTo(x2 - len * Math.cos(angle + 0.4), y2 - len * Math.sin(angle + 0.4));
    context.closePath();
    context.fill();
  }

  function pos(ev) {
    const rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    if (tool === 'text') {
      const p = pos(ev);
      const text = prompt('Label text');
      if (text) {
        strokes.push({ tool: 'text', text, x: p.x, y: p.y });
        redraw();
      }
      return;
    }
    drawing = true;
    current = { tool, points: [pos(ev)] };
    canvas.setPointerCapture(ev.pointerId);
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!drawing || !current) return;
    if (tool === 'arrow') {
      current.points = [current.points[0], pos(ev)];
    } else {
      current.points.push(pos(ev));
    }
    redraw();
  });

  canvas.addEventListener('pointerup', () => {
    if (!drawing || !current) return;
    drawing = false;
    strokes.push(current);
    current = null;
    redraw();
  });

  imageEl.addEventListener('load', resize);
  window.addEventListener('resize', resize);
  if (imageEl.complete) resize();

  return {
    setTool(t) {
      tool = t;
    },
    undo() {
      strokes.pop();
      redraw();
    },
    clear() {
      strokes = [];
      redraw();
    },
    async exportPng() {
      const out = document.createElement('canvas');
      out.width = imageEl.naturalWidth;
      out.height = imageEl.naturalHeight;
      const octx = out.getContext('2d');
      octx.drawImage(imageEl, 0, 0);
      for (const s of strokes) drawStroke(octx, s, scale);
      return out.toDataURL('image/png');
    },
    destroy() {
      wrap.remove();
    },
    getWrap() {
      return wrap;
    },
  };
}
