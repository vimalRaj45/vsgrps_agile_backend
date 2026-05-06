require('dotenv').config();
const axios = require('axios');

async function testCloudflareAI() {
  const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0062c9f9a7ea658980e06d881142fd14';
  const API_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

  if (!API_TOKEN || API_TOKEN === 'your_cloudflare_api_token_here') {
    console.error('❌ Error: CLOUDFLARE_AI_TOKEN is not set in .env file.');
    console.log('Please add CLOUDFLARE_AI_TOKEN=your_real_token to backend/.env');
    return;
  }

  console.log('🚀 Testing Cloudflare AI Workers...');
  console.log(`📍 Account ID: ${ACCOUNT_ID}`);
  console.log('🤖 Model: @cf/meta/llama-3-8b-instruct');

  try {
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant.'
          },
          {
            role: 'user',
            content: 'Write a one-sentence story about a robot who loves coffee.'
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.success) {
      console.log('✅ Success!');
      console.log('📝 Response:', response.data.result.response);
    } else {
      console.error('❌ Cloudflare Error:', response.data.errors);
    }
  } catch (err) {
    console.error('❌ Request Failed:', err.response?.data || err.message);
  }
}

testCloudflareAI();
