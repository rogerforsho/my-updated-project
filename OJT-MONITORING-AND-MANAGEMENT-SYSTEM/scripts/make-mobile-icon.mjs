// One-off: builds the mobile app icons from the untouched official seal (assets/logo.png) and the campus photo.
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/mobile/assets');
const seal = path.join(root, 'logo.png');
const GREEN = '#0A3824';
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const sealAt = (size) => sharp(seal).resize(size, size, { fit: 'contain', background: CLEAR }).png().toBuffer();
const onCanvas = (bg, buf, size) => sharp({ create: { width: 1024, height: 1024, channels: 4, background: bg } })
  .composite([{ input: buf, left: Math.round((1024 - size) / 2), top: Math.round((1024 - size) / 2) }]).png();

// icon.png: seal at 62% on the deep green tile
await onCanvas(GREEN, await sealAt(635), 635).toFile(path.join(root, 'icon.png'));
// adaptive foreground: seal at 46%, inside the 66% safe zone, transparent
await onCanvas(CLEAR, await sealAt(471), 471).toFile(path.join(root, 'android-icon-foreground.png'));
// monochrome: the seal's dark details (ring text, shield, outline) as white shapes, light areas transparent
const sealBuf = await sealAt(471);
const dark = await sharp(sealBuf).flatten({ background: '#ffffff' }).grayscale().threshold(150).negate().raw().toBuffer();
const rgba = Buffer.alloc(471 * 471 * 4, 255);
for (let i = 0; i < dark.length; i++) rgba[i * 4 + 3] = dark[i];
const mono = await sharp(rgba, { raw: { width: 471, height: 471, channels: 4 } }).png().toBuffer();
await onCanvas(CLEAR, mono, 471).toFile(path.join(root, 'android-icon-monochrome.png'));
// splash + favicon
await sharp(await sealAt(512)).toFile(path.join(root, 'splash-icon.png'));
await sharp(await sealAt(512)).resize(48, 48).toFile(path.join(root, 'favicon.png'));
// campus photo for the auth header
await sharp(path.join(root, '../../web/public/cdm-campus.jpg')).resize({ width: 1200 }).jpeg({ quality: 78 }).toFile(path.join(root, 'campus.jpg'));
console.log('done');
