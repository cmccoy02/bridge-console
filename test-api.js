#!/usr/bin/env node

/**
 * Test script to verify API endpoints
 * Run: node test-api.js
 */

async function testAPI() {
  console.log('[TEST] Testing Bridge API Endpoints...\n');

  try {
    // Test 1: Health check
    console.log('[1]  Testing health endpoint...');
    const healthRes = await fetch('http://localhost:3001/api/health');
    console.log('   Status:', healthRes.status);
    console.log('   Content-Type:', healthRes.headers.get('content-type'));

    if (healthRes.ok) {
      const health = await healthRes.json();
      console.log('   Response:', health);
      console.log('   [OK] Health check passed\n');
    } else {
      console.log('   [X] Health check failed\n');
    }

    // Test 2: Get repositories
    console.log('[2]  Testing GET /api/repositories...');
    const getRes = await fetch('http://localhost:3001/api/repositories');
    console.log('   Status:', getRes.status);
    console.log('   Content-Type:', getRes.headers.get('content-type'));

    if (getRes.ok) {
      const repos = await getRes.json();
      console.log('   Repositories:', repos.length);
      console.log('   [OK] GET repositories passed\n');
    } else {
      const text = await getRes.text();
      console.log('   Response:', text.substring(0, 100));
      console.log('   [X] GET repositories failed\n');
    }

    // Test 3: Add repository
    console.log('[3]  Testing POST /api/repositories...');
    const testRepo = {
      repoUrl: 'https://github.com/test/test-repo'
    };

    const postRes = await fetch('http://localhost:3001/api/repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRepo)
    });

    console.log('   Status:', postRes.status);
    console.log('   Content-Type:', postRes.headers.get('content-type'));

    if (postRes.ok) {
      const result = await postRes.json();
      console.log('   Response:', result);
      console.log('   [OK] POST repository passed\n');

      // Clean up test repo
      if (result.id) {
        await fetch(`http://localhost:3001/api/repositories/${result.id}`, {
          method: 'DELETE'
        });
        console.log('   [OK] Cleaned up test repository\n');
      }
    } else {
      const contentType = postRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const error = await postRes.json();
        console.log('   Error:', error);
      } else {
        const text = await postRes.text();
        console.log('   Response (non-JSON):', text.substring(0, 200));
      }
      console.log('   [X] POST repository failed\n');
    }

    console.log('[DONE] API test complete!\n');

  } catch (error) {
    console.error('[FAIL] Test failed:', error.message);
    console.log('\n[DEBUG] Troubleshooting:');
    console.log('   1. Make sure backend is running: npm run server');
    console.log('   2. Check if port 3001 is correct');
    console.log('   3. Verify .env file has required keys\n');
  }
}

testAPI();
