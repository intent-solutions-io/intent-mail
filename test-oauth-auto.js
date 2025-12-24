#!/usr/bin/env node
/**
 * Test OAuth Flow - Automatic Mode
 *
 * Opens browser, waits for authorization, creates account.
 */

import 'dotenv/config';
import { mailAuthStartTool } from './dist/mcp/tools/mail-auth-start.js';

async function testOAuthAutomatic() {
  console.log('🧪 Testing Gmail OAuth - AUTOMATIC MODE\n');

  console.log('This will:');
  console.log('1. ✅ Open your default browser');
  console.log('2. ✅ Start local server on port 3000');
  console.log('3. ✅ Wait for you to authorize');
  console.log('4. ✅ Exchange code for tokens');
  console.log('5. ✅ Create account in database');
  console.log('\n');

  console.log('⏳ Starting automatic OAuth flow...\n');

  try {
    const result = await mailAuthStartTool.handler({
      provider: 'gmail',
      manualMode: false,  // Automatic!
      port: 3000
    });

    const response = JSON.parse(result.content[0].text);

    console.log('\n✅ OAuth Flow Complete!\n');
    console.log('📝 Result:');
    console.log(JSON.stringify(response, null, 2));

    if (response.success) {
      console.log('\n🎉 SUCCESS! Account created:');
      console.log(`   Account ID: ${response.accountId}`);
      console.log(`   Email: ${response.email}`);
      console.log(`   Provider: ${response.provider}`);
      console.log('\n✅ Ready for email sync!');
    } else {
      console.log('\n❌ OAuth failed:', response.message);
    }

  } catch (error) {
    console.error('\n❌ OAuth test failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testOAuthAutomatic();
