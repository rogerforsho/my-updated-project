const http = require('http');
const https = require('https');

function checkServerReady(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        finish({ ready: false, errorCode: 'INVALID_URL' });
        return;
      }

      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname || '/'}${parsed.search}`,
        method: 'HEAD',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'CdM-Desktop-Client/1.0.0' },
      }, (res) => {
        const statusCode = res.statusCode || 0;
        res.resume();
        finish({ ready: statusCode >= 200 && statusCode < 500, statusCode });
      });

      req.on('error', (error) => {
        finish({ ready: false, errorCode: error.code || 'NETWORK_ERROR' });
      });
      req.on('timeout', () => {
        req.destroy();
        finish({ ready: false, errorCode: 'ETIMEDOUT' });
      });
      req.end();
    } catch {
      finish({ ready: false, errorCode: 'INVALID_URL' });
    }
  });
}

module.exports = { checkServerReady };
