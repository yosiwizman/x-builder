/**
 * Smoke test for the /api/publish endpoint.
 *
 * Usage:
 *   Contract mode: `pnpm smoke:publish <site-url>`
 *   E2E mode:      `pnpm smoke:publish <site-url> --e2e`
 *   R2 E2E mode:   `pnpm smoke:publish <site-url> --e2e --r2`
 *
 * Contract mode verifies:
 * 1. Endpoint exists (not 404).
 * 2. Returns JSON response.
 * 3. Handles missing files correctly (400).
 * 4. SPA fallback doesn't intercept API routes.
 *
 * E2E mode additionally:
 * 5. POSTs a minimal static site.
 * 6. Asserts success response includes a URL.
 * 7. Fetches the deployed URL and validates it serves HTML.
 *
 * R2 E2E mode:
 * - Uses provider=r2_worker instead of Pages.
 * - Tests deterministic R2 serving (no propagation delay).
 * - Pages E2E is known flaky; R2 E2E should be reliable.
 */

const args = process.argv.slice(2);
const E2E_FLAG = '--e2e';
const R2_FLAG = '--r2';
const isE2E = args.includes(E2E_FLAG);
const isR2 = args.includes(R2_FLAG);
const BASE_URL = args.find((arg) => !arg.startsWith('--'));

if (!BASE_URL) {
  console.error('Usage: pnpm smoke:publish <site-url> [--e2e] [--r2]');
  console.error('Example: pnpm smoke:publish https://x-builder-staging.pages.dev');
  console.error('Example: pnpm smoke:publish https://x-builder-staging.pages.dev --e2e');
  console.error('Example: pnpm smoke:publish https://x-builder-staging.pages.dev --e2e --r2');
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

// minimal static site payload for E2E testing
const SMOKE_FILES = {
  'index.html': '<!doctype html><html><head><title>Smoke</title></head><body>ok</body></html>',
  'assets/app.js': "console.log('smoke');",
};

interface PublishResponse {
  success?: boolean;
  url?: string;
  error?: string;
  provider?: string;
}

async function runTests() {
  const mode = isE2E ? (isR2 ? 'R2 E2E' : 'Pages E2E (known flaky)') : 'Contract';
  console.log(`\n[${mode} Mode] Smoke testing: ${PUBLISH_URL}\n`);

  if (isR2) {
    console.log('Provider: r2_worker (deterministic)\n');
  }

  console.log('--- Contract Checks ---\n');

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

  // E2E tests: only run when --e2e flag is provided
  if (isE2E) {
    const providerLabel = isR2 ? 'R2 Worker' : 'Pages';
    console.log(`\n--- E2E Checks (${providerLabel}) ---\n`);

    let deployedUrl: string | undefined;

    // test 5: POST minimal site returns success with URL
    const testName = isR2
      ? 'POST minimal site via R2 returns success with URL'
      : 'POST minimal site via Pages returns success with URL (flaky)';

    await test(testName, async () => {
      const res = await fetch(PUBLISH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: SMOKE_FILES,
          projectName: isR2 ? 'smoke-test-r2' : 'smoke-test',
          provider: isR2 ? 'r2_worker' : 'pages',
        }),
      });

      if (res.status !== 200) {
        const errorBody = await res.text();
        throw new Error(`Expected 200, got ${res.status}: ${errorBody}`);
      }

      const data = (await res.json()) as PublishResponse;

      if (!data.success) {
        throw new Error(`Expected success:true, got: ${JSON.stringify(data)}`);
      }

      if (!data.url || typeof data.url !== 'string') {
        throw new Error(`Expected url string, got: ${JSON.stringify(data)}`);
      }

      deployedUrl = data.url;
      console.log(`  → Deployed to: ${deployedUrl}`);
      console.log(`  → Provider: ${data.provider || 'unknown'}`);
    });

    /**
     * Test 6: deployed URL serves HTML.
     * R2 is deterministic (no retry needed), Pages may need retries.
     */
    const serveTestName = isR2
      ? 'R2 deployed URL serves HTML (deterministic)'
      : 'Pages deployed URL serves HTML (with retry)';

    await test(serveTestName, async () => {
      if (!deployedUrl) {
        throw new Error('No deployed URL from previous test');
      }

      /**
       * R2 is deterministic, no retry needed.
       * Pages may need propagation delay.
       */
      const maxRetries = isR2 ? 1 : 5;
      const retryDelay = 3000; // 3 seconds

      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(deployedUrl);

          if (res.status !== 200) {
            throw new Error(`Expected 200, got ${res.status}`);
          }

          const contentType = res.headers.get('content-type') || '';

          if (!contentType.includes('text/html')) {
            throw new Error(`Expected text/html, got: ${contentType}`);
          }

          const body = await res.text();

          if (!body.includes('<title>Smoke</title>') && !body.includes('ok')) {
            throw new Error('Response body does not contain expected content');
          }

          // success - exit retry loop
          if (isR2) {
            console.log('  → R2 determinism verified: immediate 200 response');
          }

          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          if (attempt < maxRetries) {
            console.log(`  → Attempt ${attempt}/${maxRetries} failed, retrying in ${retryDelay / 1000}s...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      throw lastError || new Error('All retry attempts failed');
    });
  }

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
