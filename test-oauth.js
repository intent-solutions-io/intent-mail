#!/usr/bin/env node
/**
 * Test OAuth Flow
 *
 * Tests mail_auth_start in manual mode to verify OAuth configuration.
 */

import 'dotenv/config';
import { mailAuthStartTool } from './dist/mcp/tools/mail-auth-start.js';

async function testOAuth() {
  console.log('🧪 Testing Gmail OAuth Configuration\n');

  console.log('📋 Environment Check:');
  console.log('  GMAIL_CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('  GMAIL_CLIENT_SECRET:', process.env.GMAIL_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('');

  try {
    console.log('🔐 Calling mail_auth_start (manual mode)...\n');

    const result = await mailAuthStartTool.handler({
      provider: 'gmail',
      manualMode: true,
      port: 3000
    });

    const response = JSON.parse(result.content[0].text);

    console.log('✅ OAuth URL Generated Successfully!\n');
    console.log('📝 Response:');
    console.log(JSON.stringify(response, null, 2));
    console.log('\n');

    if (response.authUrl) {
      console.log('🌐 Authorization URL:');
      console.log(response.authUrl);
      console.log('\n');
      console.log('📌 Next Steps:');
      console.log('1. Open the URL above in your browser');
      console.log('2. Sign in with your Gmail account');
      console.log('3. Authorize IntentMail');
      console.log('4. Copy the authorization code');
      console.log('5. Use mail_auth_complete to finish setup');
      console.log('\n');
      console.log('✅ OAuth configuration is working correctly!');
    }

  } catch (error) {
    console.error('❌ OAuth test failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testOAuth();
