const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const repoRoot = path.join(__dirname, '..');
const mobileSource = fs.readFileSync(
  path.join(repoRoot, 'apps', 'mobile', 'src', 'lib', 'supabase.ts'),
  'utf8',
);
const mobileJavaScript = ts.transpileModule(mobileSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function initializeSupabase(url, environment = 'preview', anonKey = 'test-anon-key') {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    URL,
    Set,
    Error,
    process: {
      env: {
        EXPO_PUBLIC_SUPABASE_URL: url,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        EXPO_PUBLIC_APP_ENV: environment,
      },
    },
    require(name) {
      if (name === '@supabase/supabase-js') {
        return { createClient: (...args) => ({ args }) };
      }
      if (name === 'expo-secure-store') {
        return {
          getItemAsync() {},
          setItemAsync() {},
          deleteItemAsync() {},
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  };

  vm.runInNewContext(mobileJavaScript, context);
  return module.exports.supabase;
}

test('non-production mobile environments refuse the production project but allow staging', () => {
  assert.throws(
    () => initializeSupabase('https://jhslfwczxkdhexjgssjr.supabase.co'),
    /Refusing to connect/,
  );
  assert.doesNotThrow(() => initializeSupabase('https://xlkvjuwzcviicerpzdjz.supabase.co'));
});

test('preview mobile can initialize against a separate isolated project', () => {
  assert.doesNotThrow(() => initializeSupabase('https://new-isolated-ref.supabase.co'));
});

test('production mobile can initialize against its configured production project', () => {
  assert.doesNotThrow(() =>
    initializeSupabase('https://jhslfwczxkdhexjgssjr.supabase.co', 'production'),
  );
});

test('mobile requires both Supabase URL and anon key', () => {
  assert.throws(
    () => initializeSupabase('https://new-isolated-ref.supabase.co', 'preview', ''),
    /Configure the Supabase URL and anon key/,
  );
});

test('EAS preview uses preview environment values and does not inline Supabase credentials', () => {
  const easConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'eas.json'), 'utf8'),
  );

  assert.equal(easConfig.build.preview.environment, 'preview');
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_APP_ENV, 'preview');
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_SUPABASE_URL, undefined);
  assert.equal(easConfig.build.preview.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, undefined);
  assert.equal(easConfig.build['appetize-ios'].extends, 'preview');
  assert.equal(easConfig.build.production.environment, 'production');
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_APP_ENV, 'production');
});

test('mobile native attendance has a development-client build dependency', () => {
  const mobilePackage = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'package.json'), 'utf8'),
  );
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'app.json'), 'utf8'),
  );
  const easConfig = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'apps', 'mobile', 'eas.json'), 'utf8'),
  );

  assert.ok(mobilePackage.dependencies['expo-dev-client']);
  assert.equal(easConfig.build.development.developmentClient, true);
  assert.deepEqual(appConfig.expo.platforms, ['ios', 'android']);
});

test('local web container LAN binding is configurable', () => {
  const compose = fs.readFileSync(path.join(repoRoot, 'compose.yaml'), 'utf8');
  const dockerExample = fs.readFileSync(path.join(repoRoot, '.env.docker.example'), 'utf8');

  assert.match(compose, /\$\{OJT_LOCAL_LAN_IP/);
  assert.match(dockerExample, /^OJT_LOCAL_LAN_IP=/m);
});
