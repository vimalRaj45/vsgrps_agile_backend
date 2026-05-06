const axios = require('axios');
const authenticate = require('../middleware/authenticate');

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CLOUDFLARE_ACCOUNT_ID = '0062c9f9a7ea658980e06d881142fd14';

async function aiRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/suggest-tasks', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { requirement, projectId } = req.body;

    if (!requirement) {
      return reply.code(400).send({ error: 'Requirement is required' });
    }

    if (!CLOUDFLARE_API_TOKEN) {
      console.error('❌ Missing CLOUDFLARE_API_TOKEN');
      return reply.code(500).send({ error: 'AI service configuration error' });
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
              8.  "estimation_rationale": (string: MANDATORY - Why this priority/hours? e.g., "High priority because authentication is a core security component...")
              9.  "predictive_risk_analysis": (string: MANDATORY - Potential bottleneck? e.g., "Risk of delays due to third-party OAuth configuration complexity...")
              10. "impact_score": (number: 1-100 - Importance to project success)

              Example Output:
              {
                "tasks": [
                  {
                    "title": "Setup OAuth",
                    "description": "...",
                    "priority": "High",
                    "estimated_hours": 8,
                    "days_to_complete": 2,
                    "recommended_role": "Backend",
                    "subtasks": ["..."],
                    "estimation_rationale": "Critical for security...",
                    "predictive_risk_analysis": "API rate limits...",
                    "impact_score": 95
                  }
                ]
              }
              `
            },
            {
              role: 'user',
              content: `Project ID: ${projectId || 'General'}. Requirement: ${requirement}`
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Cloudflare Workers AI returns { result: { response: "..." } }
      const content = response.data.result?.response || "";
      
      let tasks;
      try {
          const parsed = JSON.parse(content);
          tasks = Array.isArray(parsed) ? parsed : (parsed.tasks || parsed.suggestions || []);
      } catch (e) {
          // Fallback regex to find JSON array if parsing fails
          const match = content.match(/\[.*\]/s);
          tasks = match ? JSON.parse(match[0]) : [];
      }

      return { tasks };
    } catch (err) {
      console.error('Cloudflare AI Error:', err.response?.data || err.message);
      return reply.code(500).send({ error: 'AI suggestion failed' });
    }
  });
}

module.exports = aiRoutes;
