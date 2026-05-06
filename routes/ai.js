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
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
        {
          messages: [
            {
              role: 'system',
              content: `Return ONLY a JSON object with a "tasks" key containing an array of objects. 
              Each task object MUST STRICTLY include these 10 fields:
              1.  "title": (string)
              2.  "description": (string)
              3.  "priority": (string: Low, Medium, High, Critical)
              4.  "estimated_hours": (number)
              5.  "days_to_complete": (number)
              6.  "recommended_role": (string)
              7.  "subtasks": (array of strings)
              8.  "estimation_rationale": (string)
              9.  "predictive_risk_analysis": (string)
              10. "impact_score": (number: 1-100)

              IMPORTANT: You MUST respond with valid JSON ONLY. No preamble, no explanation.`
            },
            {
              role: 'user',
              content: `Project Context: ${projectId || 'General'}. Requirement: ${requirement}`
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_AI_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.errors?.[0]?.message || 'Cloudflare AI request failed');
      }

      const content = result.result.response;
      
      let tasks = [];
      try {
          const parsed = JSON.parse(content);
          tasks = parsed.tasks || (Array.isArray(parsed) ? parsed : []);
      } catch (e) {
          // Robust parsing for common AI markdown output
          const jsonMatch = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
          if (jsonMatch) {
              const cleaned = JSON.parse(jsonMatch[0]);
              tasks = cleaned.tasks || (Array.isArray(cleaned) ? cleaned : []);
          }
      }

      return { tasks };
    } catch (err) {
      console.error('Cloudflare AI Error:', err.response?.data || err.message);
      return reply.code(500).send({ error: 'AI suggestion failed. Please ensure CLOUDFLARE_AI_TOKEN is valid.' });
    }
  });
}

module.exports = aiRoutes;
