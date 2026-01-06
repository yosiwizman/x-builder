/**
 * Smoke test for the /api/publish endpoint.
 *
 * Usage: `pnpm smoke:publish <site-url>`.
 *
 * Verifies:
 * 1. Endpoint exists (not 404).
 * 2. Returns JSON response.
 * 3. Handles missing files correctly (400).
 * 4. SPA fallback doesn't intercept API routes.
 */

const BASE_URL = process.argv[2];

if (!BASE_URL) {
  console.error('Usage: pnpm smoke:publish <site-url>');
  console.error('Example: pnpm smoke:publish https://x-builder-staging.pages.dev');
  process.exit(1);
}

const PUBLISH_URL = `${BASE_URL.replace(/\/$/, '')}/api/publish`;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true, message: 'OK' });
    console.log(`✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, message });
    console.log(`✗ ${name}: ${message}`);
  }
}

async function runTests() {
  console.log(`\nSmoke testing: ${PUBLISH_URL}\n`);

  // test 1: endpoint exists (POST returns non-404)
  await test('Endpoint exists (not 404)', async () => {
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (res.status === 404) {
      throw new Error(`Got 404 - endpoint not found or SPA fallback intercepted`);
    }
  });

  // test 2: returns JSON content-type
  await test('Returns JSON content-type', async () => {
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON, got: ${contentType}`);
    }
  });

  // test 3: empty files returns 400 error
  await test('Empty files returns 400', async () => {
    const res = await fetch(PUBLISH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: {} }),
    });

    if (res.status !== 400) {
      throw new Error(`Expected 400, got ${res.status}`);
    }

    const data = (await res.json()) as { error?: string };

    if (!data.error) {
      throw new Error('Expected error field in response');
    }
  });

  // test 4: GET method returns error (not 200 HTML)
  await test('GET returns error (not 200 HTML)', async () => {
    const res = await fetch(PUBLISH_URL, { method: 'GET' });

    // should return an error status, not 200 with HTML (SPA fallback)
    const contentType = res.headers.get('content-type') || '';

    if (res.status === 200 && contentType.includes('text/html')) {
      throw new Error('SPA fallback intercepted - returned HTML instead of API error');
    }
  });

  // summary
  console.log('\n---');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`\nResults: ${passed}/${total} passed\n`);

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
