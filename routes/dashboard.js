const pool = require('../db');
const authenticate = require('../middleware/authenticate');

async function dashboardRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (req, reply) => {
    const companyId = req.session.companyId;

    const totalTasks = await pool.query('SELECT count(*) FROM tasks WHERE company_id = $1', [companyId]);
    const overdueTasks = await pool.query('SELECT count(*) FROM tasks WHERE company_id = $1 AND due_date < CURRENT_DATE AND status != \'Done\'', [companyId]);
    const doneToday = await pool.query('SELECT count(*) FROM tasks WHERE company_id = $1 AND status = \'Done\' AND updated_at::date = CURRENT_DATE', [companyId]);
    const upcomingMeetingsCount = await pool.query('SELECT count(*) FROM meetings WHERE company_id = $1 AND scheduled_at > NOW()', [companyId]);

    const overdueTasksList = await pool.query(
      'SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.company_id = $1 AND t.due_date < CURRENT_DATE AND t.status != \'Done\' ORDER BY t.due_date ASC LIMIT 5',
      [companyId]
    );

    const upcomingMeetingsList = await pool.query(
      'SELECT m.*, p.name as project_name FROM meetings m LEFT JOIN projects p ON m.project_id = p.id WHERE m.company_id = $1 AND m.scheduled_at > NOW() ORDER BY m.scheduled_at ASC LIMIT 5',
      [companyId]
    );

    const userPerformance = await pool.query(`
      SELECT u.id, u.name, u.avatar_url,
             COUNT(t.id) FILTER (WHERE t.status = 'Done') as completed_tasks,
             COUNT(t.id) FILTER (WHERE t.status != 'Done') as pending_tasks
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to
      WHERE u.company_id = $1
      GROUP BY u.id, u.name, u.avatar_url
      ORDER BY completed_tasks DESC
    `, [companyId]);

    const projectHealth = await pool.query(`
      SELECT p.id, p.name, p.status,
             COUNT(t.id) as total_tasks,
             COUNT(t.id) FILTER (WHERE t.status = 'Done') as done_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.company_id = $1
      GROUP BY p.id, p.name, p.status
    `, [companyId]);

    return {
      totalTasks: parseInt(totalTasks.rows[0].count),
      overdueTasks: parseInt(overdueTasks.rows[0].count),
      doneToday: parseInt(doneToday.rows[0].count),
      upcomingMeetingsCount: parseInt(upcomingMeetingsCount.rows[0].count),
      overdueTasksList: overdueTasksList.rows,
      upcomingMeetingsList: upcomingMeetingsList.rows,
      userPerformance: userPerformance.rows.map(r => ({
        ...r,
        completed_tasks: parseInt(r.completed_tasks),
        pending_tasks: parseInt(r.pending_tasks)
      })),
      projectHealth: projectHealth.rows.map(r => ({
        ...r,
        total_tasks: parseInt(r.total_tasks),
        done_tasks: parseInt(r.done_tasks),
        percent: r.total_tasks > 0 ? Math.round((r.done_tasks / r.total_tasks) * 100) : 0
      }))
    };
  });

  fastify.get('/velocity', async (req, reply) => {
    const companyId = req.session.companyId;

    // Group completed tasks by week for the last 12 weeks
    const result = await pool.query(`
      SELECT 
        TO_CHAR(DATE_TRUNC('week', updated_at), 'YYYY-"W"IW') as week,
        COUNT(*) as completed_tasks
      FROM tasks 
      WHERE company_id = $1 
      AND status = 'Done'
      AND updated_at >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY week
      ORDER BY week ASC
    `, [companyId]);

    return result.rows;
  });
}

module.exports = dashboardRoutes;
