// Turns image files you pick (e.g. photos downloaded from Cosmos) into wallpaper records:
//  - hash:    a SHA-256 fingerprint of the file, used to skip duplicates
//  - display: a copy no larger than the iPad screen (keeps memory use and storage small)
//  - thumb:   a small preview for the settings grid
//  - focal:   where the "interesting" part of the picture is, used for smart cropping
//  - lum:     brightness of each corner, so the widget/clock can stay readable over bright photos
import { hasImage, addImage, keepStorage } from "./library.js";

const MAX_EDGE = 2732;   // long edge of the largest iPad screen, in pixels
const THUMB_EDGE = 360;

export async function hashFile(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function decode(file) {
  try {
    const bmp = await createImageBitmap(file);
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close && bmp.close() };
  } catch {
    // Fallback for formats createImageBitmap can't read on this browser.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error("unreadable"); }
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
const toBlob = (c, q) => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q));

async function scaled(img, edge, quality) {
  const k = Math.min(1, edge / Math.max(img.w, img.h));
  const c = canvas(Math.max(1, Math.round(img.w * k)), Math.max(1, Math.round(img.h * k)));
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img.src, 0, 0, c.width, c.height);
  return { blob: await toBlob(c, quality), w: c.width, h: c.height };
}

/** Looks at a 64-pixel version of the image to find its subject and how bright each corner is. */
export function analyse(img) {
  const S = 64, k = S / Math.max(img.w, img.h);
  const w = Math.max(8, Math.round(img.w * k)), h = Math.max(8, Math.round(img.h * k));
  const c = canvas(w, h), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img.src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h), sat = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2];
    lum[i] = (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 255;
    sat[i] = (Math.max(r, gr, b) - Math.min(r, gr, b)) / 255;
  }
  // Focal point: weighted centre of edges (detail) and colour, with a gentle pull toward the middle.
  let sx = 0, sy = 0, sw = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const edge = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w]);
    const dx = x / w - 0.5, dy = y / h - 0.5;
    const centre = 1 - Math.min(1, (dx * dx + dy * dy) * 1.6);
    const wt = (edge * 0.8 + sat[i] * 0.2) ** 2 * (0.4 + 0.6 * centre);
    sx += x * wt; sy += y * wt; sw += wt;
  }
  const clamp = v => Math.min(0.85, Math.max(0.15, v));
  const focal = sw > 0 ? { x: +clamp(sx / sw / w).toFixed(3), y: +clamp(sy / sw / h).toFixed(3) } : { x: 0.5, y: 0.5 };
  // Average brightness of the four corner regions (each 40% × 40% of the image).
  const region = (x0, y0) => {
    let s = 0, n = 0;
    for (let y = Math.floor(y0 * h); y < Math.floor((y0 + 0.4) * h); y++)
      for (let x = Math.floor(x0 * w); x < Math.floor((x0 + 0.4) * w); x++) { s += lum[y * w + x]; n++; }
    return n ? +(s / n).toFixed(3) : 0.5;
  };
  return { focal, lum: { tl: region(0, 0), tr: region(0.6, 0), bl: region(0, 0.6), br: region(0.6, 0.6) } };
}

const IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif|heic|heif)$/i;

export async function processFile(file, hash) {
  if (!(file.type || "").startsWith("image/") && !IMAGE_NAME.test(file.name || "")) throw new Error("not-image");
  const img = await decode(file);
  try {
    // Keep the original when it's already screen-sized and a format every browser shows (best quality).
    const keep = Math.max(img.w, img.h) <= MAX_EDGE && /^image\/(jpeg|png|webp)$/.test(file.type);
    const display = keep ? { blob: file, w: img.w, h: img.h } : await scaled(img, MAX_EDGE, 0.9);
    const thumb = await scaled(img, THUMB_EDGE, 0.8);
    const { focal, lum } = analyse(img);
    return { hash, name: String(file.name || "image").slice(0, 120), w: display.w, h: display.h, display: display.blob, thumb: thumb.blob, focal, lum };
  } finally {
    img.close();
  }
}

/** Imports files one at a time (keeps memory low on iPad). Reports progress after each file. */
export async function importFiles(collectionId, files, onProgress) {
  const r = { total: files.length, done: 0, added: 0, duplicates: 0, failed: 0 };
  await keepStorage();
  for (const f of files) {
    try {
      const hash = await hashFile(f);
      if (await hasImage(collectionId, hash)) r.duplicates++;
      else { await addImage(collectionId, await processFile(f, hash)); r.added++; }
    } catch {
      r.failed++;
    }
    r.done++;
    onProgress && onProgress({ ...r });
  }
  return r;
}
