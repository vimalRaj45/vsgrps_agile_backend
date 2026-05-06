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

  console.log('🚀 Testing Cloudflare AI Gateway...');
  console.log(`📍 Account ID: ${ACCOUNT_ID}`);
  console.log('🤖 Model: workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast');

  try {
    const response = await axios.post(
      `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/default/compat/chat/completions`,
      {
        model: 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
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
          'cf-aig-authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.choices) {
      console.log('✅ Success!');
      console.log('📝 Response:', response.data.choices[0].message.content);
    } else {
      console.error('❌ Cloudflare Error:', response.data);
    }
  } catch (err) {
    console.error('❌ Request Failed:', err.response?.data || err.message);
  }
}

testCloudflareAI();
