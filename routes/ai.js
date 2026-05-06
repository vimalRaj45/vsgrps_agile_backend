const axios = require('axios');
const authenticate = require('../middleware/authenticate');

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0062c9f9a7ea658980e06d881142fd14';
const CLOUDFLARE_AI_TOKEN = process.env.CLOUDFLARE_AI_TOKEN;

async function aiRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/suggest-tasks', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { requirement, projectId } = req.body;

    if (!requirement) {
      return reply.code(400).send({ error: 'Requirement is required' });
    }

    if (!CLOUDFLARE_AI_TOKEN) {
      console.warn('⚠️ CLOUDFLARE_AI_TOKEN is missing in .env');
    }

    try {
      console.log('🔮 Calling Cloudflare AI Gateway (Llama 3.3 70B) for project:', projectId || 'General');
      const response = await axios.post(
        `https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/default/compat/chat/completions`,
        {
          model: 'workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          messages: [
            {
              role: 'system',
              content: `You are a professional project architect. Return ONLY a valid JSON object. 
              The object MUST have a "tasks" key containing an array of objects.
              Each task object MUST include:
              1. "title" (string)
              2. "description" (string)
              3. "priority" (Low, Medium, High, Critical)
              4. "estimated_hours" (number)
              5. "days_to_complete" (number)
              6. "recommended_role" (string)
              7. "subtasks" (array of strings)
              8. "estimation_rationale" (string)
              9. "predictive_risk_analysis" (string)
              10. "impact_score" (number 1-100)

              IMPORTANT: Response must be raw JSON. No markdown, no "Sure!", no "Here is your JSON".`
            },
            {
              role: 'user',
              content: `Create a task breakdown for this requirement: ${requirement}`
            }
          ],
          temperature: 0.1
        },
        {
          headers: {
            'cf-aig-authorization': `Bearer ${CLOUDFLARE_AI_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // AI Gateway compat mode returns OpenAI-like structure: { choices: [ { message: { content: "..." } } ] }
      const content = response.data.choices?.[0]?.message?.content;
      
      if (!content) {
        console.error('❌ AI Gateway Error: No content in response', response.data);
        throw new Error('AI failed to return content');
      }

      console.log('🤖 Raw AI Response:', content);
      
      let tasks = [];
      try {
          const parsed = JSON.parse(content);
          tasks = parsed.tasks || (Array.isArray(parsed) ? parsed : []);
      } catch (e) {
          console.log('⚠️ Direct JSON parse failed, trying regex extraction...');
          const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (jsonMatch) {
              try {
                  const cleaned = JSON.parse(jsonMatch[1]);
                  tasks = cleaned.tasks || (Array.isArray(cleaned) ? cleaned : []);
                  console.log('✅ Successfully extracted JSON via regex');
              } catch (innerError) {
                  console.error('❌ Regex extraction also failed to parse as JSON');
              }
          }
      }

      if (!tasks || tasks.length === 0) {
        console.warn('⚠️ No tasks were generated or parsed.');
      }

      return { tasks };
    } catch (err) {
      console.error('Cloudflare AI Error:', err.response?.data || err.message);
      return reply.code(500).send({ error: 'AI suggestion failed. Check backend logs for details.' });
    }
  });
}

module.exports = aiRoutes;
