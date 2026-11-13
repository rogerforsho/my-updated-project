// Source-level checks for the public certificate page (house style: read the TS text, no browser needed).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'apps', 'web', 'app', 'verify-certificate', '[code]');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(dir, f));

test('prototype scaffolding is gone from the shipped page', () => {
  assert.equal(exists('PrototypeCertificateVariants.tsx'), false);
  const page = read('page.tsx');
  assert.doesNotMatch(page, /Prototype|variant=|className="hidden bg-white/);
});

test('page renders the certificate sheet for active certificates and keeps revoked / not-found states', () => {
  const page = read('page.tsx');
  assert.match(page, /import CertificateSheet from '\.\/CertificateSheet'/);
  assert.match(page, /<CertificateSheet/);
  assert.match(page, /Credential Revoked/);
  assert.match(page, /Certificate Not Found/);
});

test('certificate sheet carries every element of the approved Variant A design', () => {
  assert.ok(exists('CertificateSheet.tsx'), 'CertificateSheet.tsx must exist');
  const s = read('CertificateSheet.tsx');
  for (const text of [
    'Certificate of Practicum Completion',
    'Cryptographically Verified',
    'Practicum Coordinator',
    'Dean / College Registrar',
    'Host Training Establishment',
    'Rendered Practicum Hours',
    'Academic Term',
    'Date of Official Issuance',
    'Verification Serial',
    'Copy Serial',
    'Download PDF',
  ]) assert.ok(s.includes(text), `missing: ${text}`);
  assert.match(s, /Playfair_Display/);
  assert.ok(s.includes('#1B4332') && s.includes('#B08D57'), 'brand colours');
});

test('certificate prints cleanly to A4 landscape and hides controls in print', () => {
  const s = read('CertificateSheet.tsx');
  assert.match(s, /@page\s*\{\s*size:\s*A4 landscape/);
  assert.match(s, /print-color-adjust:\s*exact/);
  assert.match(s, /no-print/);
  assert.match(s, /window\.print\(\)/);
});

test('the QR encodes the public verify URL, not a placeholder', () => {
  const page = read('page.tsx');
  assert.match(page, /QRCode\.toString\(verifyUrl/);
  assert.match(page, /\/verify-certificate\//);
  assert.doesNotMatch(read('CertificateSheet.tsx'), /QR<br \/>CODE/);
});
