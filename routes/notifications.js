const pool = require('../db');
const authenticate = require('../middleware/authenticate');

async function notificationRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /notifications
  fastify.get('/', async (req, reply) => {
    const { rows } = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY read ASC, created_at DESC LIMIT 50',
      [req.session.userId]
    );
    return rows;
  });

  // PATCH /notifications/:id
  fastify.patch('/:id', async (req, reply) => {
    const { id } = req.params;
    const { read } = req.body;
    const { rows } = await pool.query(
      'UPDATE notifications SET read = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [read, id, req.session.userId]
    );
    return rows[0];
  });

  // POST /notifications/subscribe
  fastify.post('/subscribe', async (req, reply) => {
    const { subscription } = req.body;
    if (!subscription) return reply.code(400).send({ error: 'Missing subscription' });

    await pool.query(
      'INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1, $2) ON CONFLICT (user_id, subscription) DO NOTHING',
      [req.session.userId, JSON.stringify(subscription)]
    );

    return { success: true };
  });

  // POST /notifications/broadcast-admin
  fastify.post('/broadcast-admin', async (req, reply) => {
    try {
      if (req.session.userRole !== 'Admin') {
        return reply.code(403).send({ error: 'Only administrators can broadcast notifications' });
      }

      const { message, link } = req.body;
      if (!message) return reply.code(400).send({ error: 'Missing message' });

      const { broadcastPushNotification } = require('../utils/push');

      // 1. Create in-app notifications for everyone in the company
      const { rows: members } = await pool.query('SELECT id FROM users WHERE company_id = $1', [req.session.companyId]);
      
      const notificationPromises = members.map(member => 
        pool.query(
          'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
          [req.session.companyId, member.id, 'broadcast', message, link || '/']
        )
      );
      await Promise.all(notificationPromises);

      // 2. Send push notifications
      await broadcastPushNotification(req.session.companyId, {
        title: 'Organization Announcement',
        body: message,
        icon: '/logo192.png',
        data: { url: link || '/' }
      });

      return { success: true, message: 'Broadcast sent to all members' };
    } catch (err) {
      console.error('Broadcast Admin Error:', err);
      return reply.code(500).send({ error: 'Failed to send broadcast', details: err.message });
    }
  });
}

module.exports = notificationRoutes;
