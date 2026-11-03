import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The library ships extension-less ESM imports that plain Node cannot resolve.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
         try { return await next(s, c); } catch (e) {
           if (s.startsWith('.')) return next(s + '.js', c);
           throw e;
         }
       }`
    )
);

const lib = 'file:///' + process.cwd().replace(/\\/g, '/') + '/node_modules/@rbayuokt/expo-face-vision/build/core/';
const { validateFace } = await import(lib + 'validation.js');

// Same numbers as AttendanceScreen: oval is 0.56 x 0.36 of a 360x780 preview, centred.
const screen = readFileSync('apps/mobile/src/screens/attendance/AttendanceScreen.tsx', 'utf8');
const coverageMatch = screen.match(/minGuideCoverage:\s*([\d.]+)/);
const minRegionCoverage = coverageMatch ? Number(coverageMatch[1]) : 0.9; // library default when unset

const W = 360, H = 780;
const region = { type: 'oval', cx: W / 2, cy: H * 0.5, rx: (W * 0.56) / 2, ry: (H * 0.36) / 2 };

function check(widthOfOval, dx = 0, dy = 0) {
  const w = region.rx * 2 * widthOfOval;
  const h = w * 1.15; // ML Kit face boxes are slightly taller than wide
  const face = {
    bounds: { x: region.cx - w / 2 + dx, y: region.cy - h / 2 + dy, width: w, height: h },
    headPose: { yaw: 0, pitch: 0, roll: 0 },
  };
  return validateFace(face, { image: { width: W, height: H }, mirrored: true }, {
    requireSingleFace: true,
    region,
    minRegionCoverage,
  });
}

test('a centred face that fills the oval is accepted', () => {
  for (const fill of [0.7, 0.8, 0.9, 1.0, 1.1]) {
    const r = check(fill);
    assert.equal(r.valid, true, `fill ${fill}: coverage ${r.region.coverage.toFixed(2)} < ${minRegionCoverage}`);
  }
});

test('a face well off to the side is still rejected', () => {
  assert.equal(check(0.8, region.rx * 0.9).valid, false);
  assert.equal(check(0.8, 0, region.ry * 0.9).valid, false);
});
