#!/usr/bin/env tsx
/**
 * LLM Health Smoke Test.
 *
 * Usage: `pnpm smoke:llm <site-url>`
 *
 * Examples:
 * - `pnpm smoke:llm https://x-builder-staging.pages.dev`
 * - `pnpm smoke:llm http://localhost:5173`
 */

interface HealthResponse {
  ok: boolean;
  serverConfigured: boolean;
  byokSupported: boolean;
  supportedProviders: string[];
  timestamp: string;
}

interface LLMTestResult {
  name: string;
  passed: boolean;
  message?: string;
}

const llmResults: LLMTestResult[] = [];

function pass(name: string, message?: string) {
  llmResults.push({ name, passed: true, message });
  console.log(`✓ ${name}${message ? ` - ${message}` : ''}`);
}

function fail(name: string, message?: string) {
  llmResults.push({ name, passed: false, message });
  console.log(`✗ ${name}${message ? ` - ${message}` : ''}`);
}

async function main() {
  const siteUrl = process.argv[2];

  if (!siteUrl) {
    console.error('Usage: pnpm smoke:llm <site-url>');
    console.error('Example: pnpm smoke:llm https://x-builder-staging.pages.dev');
    process.exit(1);
  }

  const healthUrl = `${siteUrl.replace(/\/$/, '')}/api/llm/health`;

  console.log(`\n[LLM Smoke Test] Testing: ${healthUrl}\n`);
  console.log('--- Health Check ---\n');

  try {
    // test 1: health endpoint exists
    const response = await fetch(healthUrl);

    if (response.status === 200) {
      pass('Health endpoint exists (200)');
    } else {
      fail('Health endpoint exists', `Got status ${response.status}`);
    }

    // test 2: returns JSON
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      pass('Returns JSON content-type');
    } else {
      fail('Returns JSON content-type', `Got ${contentType}`);
    }

    // test 3: response structure
    const data = (await response.json()) as HealthResponse;

    if (data.ok === true) {
      pass('Response has ok: true');
    } else {
      fail('Response has ok: true', `Got ok: ${data.ok}`);
    }

    // test 4: BYOK supported
    if (data.byokSupported === true) {
      pass('BYOK is supported');
    } else {
      fail('BYOK is supported', `Got byokSupported: ${data.byokSupported}`);
    }

    // test 5: supported providers
    if (Array.isArray(data.supportedProviders) && data.supportedProviders.length > 0) {
      pass('Has supported providers', data.supportedProviders.join(', '));
    } else {
      fail('Has supported providers');
    }

    // test 6: no secrets exposed
    const responseText = JSON.stringify(data);
    const hasSecrets = /sk-[a-zA-Z0-9_-]{10,}/.test(responseText);

    if (!hasSecrets) {
      pass('No secrets exposed in response');
    } else {
      fail('No secrets exposed in response', 'Found potential API key in response!');
    }

    // test 7: server config status (informational)
    console.log(`\nServer ANTHROPIC_API_KEY configured: ${data.serverConfigured ? 'Yes' : 'No'}`);

    if (!data.serverConfigured) {
      console.log('(This is expected for staging - users provide their own keys via BYOK)');
    }
  } catch (error) {
    fail('Health endpoint accessible', error instanceof Error ? error.message : 'Unknown error');
  }

  // summary
  console.log('\n---\n');

  const passed = llmResults.filter((r) => r.passed).length;
  const total = llmResults.length;
  console.log(`Results: ${passed}/${total} passed\n`);

  if (passed < total) {
    process.exit(1);
  }
}

main().catch(console.error);
