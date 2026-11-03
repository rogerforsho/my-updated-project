import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStagingUrl, expectedRef } from './seed-staging-load.mjs';

test('accepts only the staging project URL', () => {
  assertStagingUrl(`https://${expectedRef}.supabase.co`);
  for (const bad of ['https://other.supabase.co', `https://${expectedRef}.supabase.co.evil.com`, 'http://127.0.0.1:54321', '', 'not a url']) {
    assert.throws(() => assertStagingUrl(bad), /Refusing to run/, bad);
  }
});
