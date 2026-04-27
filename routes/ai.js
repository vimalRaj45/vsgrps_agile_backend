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
            content: `You are an Agile Architect. Break down the user requirement into specific, actionable tasks. 
            Return ONLY a JSON array of objects. Each object MUST strictly contain:
            - title (string)
            - description (string)
            - priority (Low, Medium, High, Critical)
            - estimated_hours (number)
            - days_to_complete (number)
            - recommended_role (string)
            - subtasks (array of strings)
            - estimation_rationale (string: MANDATORY - Detailed explanation of why you chose this priority and these specific hours)
            - predictive_risk_analysis (string: MANDATORY - Prediction of a specific technical bottleneck or project risk for this task)
            - impact_score (number: 1-100 - Predictive score of how much this task impacts the overall project success)
            
            Format: [{"title": "...", "description": "...", "priority": "...", "estimated_hours": 0, "days_to_complete": 3, "recommended_role": "...", "subtasks": ["..."], "estimation_rationale": "...", "predictive_risk_analysis": "...", "impact_score": 85}]`
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
