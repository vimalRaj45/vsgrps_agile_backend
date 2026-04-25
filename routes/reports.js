const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

async function reportRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /reports/summary
  fastify.get('/summary', async (req, reply) => {
    const { startDate, endDate } = req.query;
    const { companyId } = req.session;

    if (!startDate || !endDate) {
      return reply.code(400).send({ error: 'Start and end dates are required' });
    }

    // 1. Tasks Summary
    const taskStats = await pool.query(`
      SELECT 
        COUNT(*) as total_created,
        COUNT(*) FILTER (WHERE status = 'Done') as total_completed,
        COUNT(*) FILTER (WHERE priority = 'Critical') as critical_tasks
      FROM tasks 
      WHERE company_id = $1 AND created_at BETWEEN $2 AND $3
    `, [companyId, startDate, endDate]);

    // 2. Completed Tasks List
    const completedTasks = await pool.query(`
      SELECT t.title, t.priority, u.name as assignee, t.updated_at as completed_at
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.company_id = $1 AND t.status = 'Done' AND t.updated_at BETWEEN $2 AND $3
      ORDER BY t.updated_at DESC
    `, [companyId, startDate, endDate]);

    // 3. Meetings Summary
    const meetingStats = await pool.query(`
      SELECT COUNT(*) as total_meetings
      FROM meetings 
      WHERE company_id = $1 AND scheduled_at BETWEEN $2 AND $3
    `, [companyId, startDate, endDate]);

    // 4. Team Activity (Top performers in this range)
    const teamActivity = await pool.query(`
      SELECT u.name, COUNT(t.id) as tasks_done
      FROM users u
      JOIN tasks t ON u.id = t.assigned_to
      WHERE u.company_id = $1 AND t.status = 'Done' AND t.updated_at BETWEEN $2 AND $3
      GROUP BY u.name
      ORDER BY tasks_done DESC
      LIMIT 5
    `, [companyId, startDate, endDate]);

    return {
      stats: {
        tasksCreated: parseInt(taskStats.rows[0].total_created),
        tasksCompleted: parseInt(taskStats.rows[0].total_completed),
        criticalTasks: parseInt(taskStats.rows[0].critical_tasks),
        totalMeetings: parseInt(meetingStats.rows[0].total_meetings)
      },
      completedTasks: completedTasks.rows,
      teamActivity: teamActivity.rows
    };
  });
}

module.exports = reportRoutes;
