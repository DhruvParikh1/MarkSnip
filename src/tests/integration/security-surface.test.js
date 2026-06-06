const fs = require('fs');
const path = require('path');

const manifestJson = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../../manifest.json'),
  'utf8'
));

describe('Security surface hardening', () => {
  test('manifest declares an explicit extension page CSP', () => {
    const csp = manifestJson.content_security_policy?.extension_pages || '';

    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('connect-src');
  });

  test('service worker treats file URLs as restricted tab URLs', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../service-worker.js'),
      'utf8'
    );
    const start = source.indexOf('function isRestrictedTabUrl');
    const end = source.indexOf('async function getAgentBridgeActiveTab');
    const restrictedUrlSource = source.slice(start, end);

    expect(restrictedUrlSource).toContain("url.startsWith('file:')");
  });
});
