const axios = require('axios');
const authenticate = require('../middleware/authenticate');

const GROQ_API_KEY = process.env.GROQ_API_KEY;

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

    try {
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
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
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const content = response.data.choices[0].messages?.content || response.data.choices[0].message.content;
      
      // Attempt to parse if it's a string, or just return if it's already an object
      let tasks;
      try {
          // If the AI returns a wrapped object like {"tasks": [...]}
          const parsed = JSON.parse(content);
          tasks = Array.isArray(parsed) ? parsed : (parsed.tasks || parsed.suggestions || []);
      } catch (e) {
          // Fallback regex to find JSON array if parsing fails
          const match = content.match(/\[.*\]/s);
          tasks = match ? JSON.parse(match[0]) : [];
      }

      return { tasks };
    } catch (err) {
      console.error('Groq AI Error:', err.response?.data || err.message);
      return reply.code(500).send({ error: 'AI suggestion failed' });
    }
  });
}

module.exports = aiRoutes;
