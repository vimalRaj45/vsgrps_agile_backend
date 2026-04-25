const pool = require('../db');
const authenticate = require('../middleware/authenticate');

async function searchRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (req, reply) => {
    const { q } = req.query;
    if (!q) return { tasks: [], projects: [], meetings: [] };

    const companyId = req.session.companyId;
    const searchTerm = `%${q}%`;

    const tasks = await pool.query(
      'SELECT id, title, status FROM tasks WHERE company_id = $1 AND title ILIKE $2 LIMIT 5',
      [companyId, searchTerm]
    );

    const projects = await pool.query(
      'SELECT id, name FROM projects WHERE company_id = $1 AND name ILIKE $2 LIMIT 5',
      [companyId, searchTerm]
    );

    const meetings = await pool.query(
      'SELECT id, title FROM meetings WHERE company_id = $1 AND title ILIKE $2 LIMIT 5',
      [companyId, searchTerm]
    );

    const users = await pool.query(
      'SELECT id, name, email FROM users WHERE company_id = $1 AND (name ILIKE $2 OR email ILIKE $2) LIMIT 5',
      [companyId, searchTerm]
    );

    const files = await pool.query(
      'SELECT id, filename FROM files WHERE company_id = $1 AND filename ILIKE $2 LIMIT 5',
      [companyId, searchTerm]
    );

    return {
      tasks: tasks.rows,
      projects: projects.rows,
      meetings: meetings.rows,
      users: users.rows,
      files: files.rows
    };
  });
}

module.exports = searchRoutes;
