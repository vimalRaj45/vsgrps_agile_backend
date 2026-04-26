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

  // GET /reports/project/:id
  fastify.get('/project/:id', async (req, reply) => {
    const { id } = req.params;
    const { companyId } = req.session;

    try {
      // 1. Project Info & Timeline
      const projectInfo = await pool.query(`
        SELECT p.*, 
               (SELECT MIN(created_at) FROM tasks WHERE project_id = p.id) as first_task_date,
               (SELECT MAX(updated_at) FROM tasks WHERE project_id = p.id AND status = 'Done') as last_completed_date
        FROM projects p 
        WHERE p.id = $1 AND p.company_id = $2
      `, [id, companyId]);

      if (projectInfo.rows.length === 0) return reply.code(404).send({ error: 'Project not found' });

      // 2. Task Statistics
      const taskStats = await pool.query(`
        SELECT 
          COUNT(*) as total_tasks,
          COUNT(*) FILTER (WHERE status = 'Done') as completed_tasks,
          COUNT(*) FILTER (WHERE status != 'Done' AND due_date < CURRENT_DATE) as overdue_tasks,
          COUNT(*) FILTER (WHERE priority = 'Critical') as critical_tasks
        FROM tasks 
        WHERE project_id = $1
      `, [id]);

      // 3. User Contribution
      const userContributions = await pool.query(`
        SELECT u.id, u.name, u.avatar_url,
               COUNT(t.id) as total_assigned,
               COUNT(t.id) FILTER (WHERE t.status = 'Done') as completed_tasks
        FROM users u
        JOIN project_members pm ON u.id = pm.user_id
        LEFT JOIN tasks t ON u.id = t.assigned_to AND t.project_id = $1
        WHERE pm.project_id = $1
        GROUP BY u.id, u.name, u.avatar_url
        ORDER BY completed_tasks DESC
      `, [id]);

      // 4. Meetings Conducted
      const meetings = await pool.query(`
        SELECT id, title, scheduled_at, outcome
        FROM meetings
        WHERE project_id = $1
        ORDER BY scheduled_at DESC
      `, [id]);

      return {
        project: projectInfo.rows[0],
        stats: {
          totalTasks: parseInt(taskStats.rows[0].total_tasks),
          completedTasks: parseInt(taskStats.rows[0].completed_tasks),
          overdueTasks: parseInt(taskStats.rows[0].overdue_tasks),
          criticalTasks: parseInt(taskStats.rows[0].critical_tasks),
          completionRate: taskStats.rows[0].total_tasks > 0 
            ? Math.round((taskStats.rows[0].completed_tasks / taskStats.rows[0].total_tasks) * 100) 
            : 0
        },
        userContributions: userContributions.rows.map(c => ({
          ...c,
          total_assigned: parseInt(c.total_assigned),
          completed_tasks: parseInt(c.completed_tasks)
        })),
        meetings: meetings.rows
      };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate project report' });
    }
  });
}

module.exports = reportRoutes;
