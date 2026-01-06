/**
 * Determinism Test Script for R2 Worker Spike
 *
 * Tests the core hypothesis: upload → URL immediately available → HTTP 200
 *
 * Run against local wrangler dev:
 *   1. Start worker: cd r2-worker-spike && pnpm dev
 *   2. Run test: npx tsx test/determinism.ts
 *
 * Run against deployed worker:
 *   WORKER_URL=https://x-builder-r2-spike.<account>.workers.dev npx tsx test/determinism.ts
 */

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8788';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details?: string;
}

const results: TestResult[] = [];

function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, duration: Date.now() - start, details });
    console.error(`✗ ${name}: ${details}`);
  }
}

async function testHealthCheck(): Promise<void> {
  const res = await fetch(`${WORKER_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('Health check status not ok');
}

async function testUploadAndServe(): Promise<void> {
  const projectId = 'test-project';
  const deploymentId = `deploy-${Date.now()}`;

  const files = {
    'index.html': toBase64('<!DOCTYPE html><html><body>Hello R2!</body></html>'),
    'styles.css': toBase64('body { color: blue; }'),
    'app.js': toBase64('console.log("loaded");'),
  };

  // Upload
  const uploadRes = await fetch(`${WORKER_URL}/upload/${projectId}/${deploymentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} - ${await uploadRes.text()}`);
  }

  const uploadData = await uploadRes.json();
  if (!uploadData.success) throw new Error('Upload not successful');

  // CRITICAL: Immediately try to serve (no delay) - this tests determinism
  const serveRes = await fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/index.html`);

  if (!serveRes.ok) {
    throw new Error(`Serve failed immediately after upload: ${serveRes.status}`);
  }

  const content = await serveRes.text();
  if (!content.includes('Hello R2!')) {
    throw new Error('Content mismatch - determinism failed');
  }

  // Check response time header
  const responseTime = serveRes.headers.get('X-Response-Time');
  console.log(`  Response time: ${responseTime}`);
}

async function testDeterminismMultipleRequests(): Promise<void> {
  const projectId = 'determinism-test';
  const deploymentId = `deploy-${Date.now()}`;

  // Upload
  await fetch(`${WORKER_URL}/upload/${projectId}/${deploymentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        'index.html': toBase64('<html><body>Determinism Test</body></html>'),
      },
    }),
  });

  // Make 10 parallel requests immediately - all should succeed
  const requests = Array(10)
    .fill(null)
    .map(() => fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/index.html`));

  const responses = await Promise.all(requests);
  const failed = responses.filter((r) => !r.ok);

  if (failed.length > 0) {
    throw new Error(`${failed.length}/10 requests failed - non-deterministic behavior`);
  }

  // Verify all responses have same content (consistency)
  const contents = await Promise.all(responses.map((r) => r.text()));
  const unique = new Set(contents);
  if (unique.size !== 1) {
    throw new Error('Inconsistent content across parallel requests');
  }
}

async function testLatencyMeasurement(): Promise<void> {
  const projectId = 'latency-test';
  const deploymentId = `deploy-${Date.now()}`;

  // Upload a larger file
  const largeContent = 'x'.repeat(100_000); // 100KB

  await fetch(`${WORKER_URL}/upload/${projectId}/${deploymentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        'large.txt': toBase64(largeContent),
      },
    }),
  });

  // Measure TTFB
  const timings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const res = await fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/large.txt`);
    await res.arrayBuffer(); // consume body
    timings.push(Date.now() - start);
  }

  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`  Latency (5 requests): avg=${avg.toFixed(0)}ms, timings=[${timings.join(', ')}]`);

  // Test ETag caching
  const res1 = await fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/large.txt`);
  const etag = res1.headers.get('ETag');

  if (etag) {
    const res2 = await fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/large.txt`, {
      headers: { 'If-None-Match': etag },
    });
    if (res2.status !== 304) {
      console.log('  Warning: ETag caching not working as expected');
    } else {
      console.log('  ETag caching: working (304 response)');
    }
  }
}

async function test404Handling(): Promise<void> {
  const res = await fetch(`${WORKER_URL}/sites/nonexistent/deploy/file.html`);
  if (res.status !== 404) {
    throw new Error(`Expected 404, got ${res.status}`);
  }
}

async function testIndexHtmlFallback(): Promise<void> {
  const projectId = 'index-test';
  const deploymentId = `deploy-${Date.now()}`;

  await fetch(`${WORKER_URL}/upload/${projectId}/${deploymentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: {
        'index.html': toBase64('<html>Root</html>'),
        'about/index.html': toBase64('<html>About</html>'),
      },
    }),
  });

  // Test directory -> index.html fallback
  const res = await fetch(`${WORKER_URL}/sites/${projectId}/${deploymentId}/about`);
  if (!res.ok) {
    throw new Error(`index.html fallback failed: ${res.status}`);
  }
  const content = await res.text();
  if (!content.includes('About')) {
    throw new Error('Wrong content served for directory');
  }
}

async function main(): Promise<void> {
  console.log(`\nR2 Worker Spike - Determinism Tests\n`);
  console.log(`Target: ${WORKER_URL}\n`);
  console.log('─'.repeat(50));

  await runTest('Health check', testHealthCheck);
  await runTest('Upload and immediate serve', testUploadAndServe);
  await runTest('Determinism (parallel requests)', testDeterminismMultipleRequests);
  await runTest('Latency measurement', testLatencyMeasurement);
  await runTest('404 handling', test404Handling);
  await runTest('Index.html fallback', testIndexHtmlFallback);

  console.log('\n' + '─'.repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.details}`);
      });
    process.exit(1);
  }

  console.log('✓ All tests passed - determinism verified!');
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
