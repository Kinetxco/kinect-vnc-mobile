export const CANVAS_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body { margin: 0; height: 100%; background: #101418; overflow: hidden; touch-action: none; }
  canvas { width: 100%; height: 100%; touch-action: none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const fb = document.createElement("canvas");
const fx = fb.getContext("2d", { willReadFrequently: true });
let scale = 1, ox = 0, oy = 0, fw = 0, fh = 0, fitted = true;
const pointers = new Map();
let drag = null;
let pinch = null;
let scrollCarry = 0;

function send(payload) {
  const text = JSON.stringify(payload);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(text);
}
function layout() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  if (fitted) fit();
  else draw();
}
function fit() {
  fitted = true;
  if (!fw || !fh) { draw(); return; }
  scale = Math.min(canvas.width / fw, canvas.height / fh);
  ox = (canvas.width - fw * scale) / 2;
  oy = (canvas.height - fh * scale) / 2;
  draw();
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!fw || !fh) return;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fb, ox, oy, fw * scale, fh * scale);
}
function ensure(w, h) {
  if (!w || !h) return;
  if (fb.width === w && fb.height === h && fw === w && fh === h) return;
  const previous = document.createElement("canvas");
  previous.width = fb.width;
  previous.height = fb.height;
  previous.getContext("2d").drawImage(fb, 0, 0);
  fb.width = w;
  fb.height = h;
  fx.drawImage(previous, 0, 0);
  fw = w;
  fh = h;
  if (fitted) fit();
}
function remote(clientX, clientY) {
  const dpr = window.devicePixelRatio || 1;
  const x = (clientX * dpr - ox) / scale;
  const y = (clientY * dpr - oy) / scale;
  return {
    x: Math.max(0, Math.min(Math.max(0, fw - 1), x)),
    y: Math.max(0, Math.min(Math.max(0, fh - 1), y))
  };
}
function b64(value) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "resize") { ensure(msg.w, msg.h); draw(); return; }
  if (msg.type === "fit") { fit(); return; }
  if (msg.type === "jpeg") {
    const img = new Image();
    img.onload = () => { fx.drawImage(img, msg.x, msg.y, msg.w, msg.h); draw(); };
    img.src = "data:image/jpeg;base64," + msg.b64;
    return;
  }
  if (msg.type === "raw") {
    const bytes = b64(msg.b64);
    const image = fx.createImageData(msg.w, msg.h);
    image.data.set(bytes.subarray(0, image.data.length));
    fx.putImageData(image, msg.x, msg.y);
    draw();
    return;
  }
  if (msg.type === "copy") {
    const sx = Math.max(0, msg.sx);
    const sy = Math.max(0, msg.sy);
    const w = Math.min(msg.w, fb.width - sx);
    const h = Math.min(msg.h, fb.height - sy);
    if (w > 0 && h > 0) {
      const slice = fx.getImageData(sx, sy, w, h);
      fx.putImageData(slice, msg.x, msg.y);
      draw();
    }
  }
}
function onNative(event) {
  try { handle(JSON.parse(event.data)); } catch (error) {}
}
document.addEventListener("message", onNative);
window.addEventListener("message", onNative);
window.addEventListener("resize", layout);

function pointOf(event) { return remote(event.clientX, event.clientY); }
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    const at = pointOf(event);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, at, moved: false, t: Date.now(), down: false };
  } else if (pointers.size === 2) {
    if (drag && drag.down) send({ type: "pointer", ...drag.at, mask: 0 });
    drag = null;
    const pts = [...pointers.values()];
    pinch = {
      d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
      scale, ox, oy
    };
  }
});
canvas.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2 && pinch) {
    const pts = [...pointers.values()];
    const previousY = pinch.y;
    const d = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;
    const zooming = Math.abs(d - pinch.d) / pinch.d > 0.08;
    if (zooming || !fitted) {
      const dpr = window.devicePixelRatio || 1;
      if (zooming) {
        const next = Math.max(0.2, Math.min(8, pinch.scale * (d / pinch.d)));
        const anchorX = (cx * dpr - pinch.ox) / pinch.scale;
        const anchorY = (cy * dpr - pinch.oy) / pinch.scale;
        scale = next;
        ox = cx * dpr - anchorX * scale;
        oy = cy * dpr - anchorY * scale;
      } else {
        ox += (cx - pinch.x) * dpr;
        oy += (cy - previousY) * dpr;
      }
      fitted = false;
      draw();
      pinch.ox = ox;
      pinch.oy = oy;
      pinch.scale = scale;
      pinch.d = d;
      pinch.x = cx;
      pinch.y = cy;
      return;
    }
    scrollCarry += cy - previousY;
    pinch.y = cy;
    pinch.x = cx;
    const at = remote(cx, cy);
    while (scrollCarry >= 36) { scrollCarry -= 36; send({ type: "scroll", ...at, delta: 1 }); }
    while (scrollCarry <= -36) { scrollCarry += 36; send({ type: "scroll", ...at, delta: -1 }); }
    return;
  }
  if (!drag || drag.id !== event.pointerId) return;
  const dist = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
  if (dist < 6) return;
  drag.moved = true;
  drag.down = true;
  drag.at = pointOf(event);
  send({ type: "pointer", ...drag.at, mask: 1 });
});
function endPointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!drag || drag.id !== event.pointerId) return;
  const at = drag.at;
  if (drag.moved) send({ type: "pointer", ...at, mask: 0 });
  else if (Date.now() - drag.t > 450) send({ type: "click", ...at, mask: 4 });
  else send({ type: "click", ...at, mask: 1 });
  drag = null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
layout();
send({ type: "ready" });
</script>
</body>
</html>`;
