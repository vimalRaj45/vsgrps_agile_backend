const fastify = require('fastify')();
fastify.register(require('@fastify/jwt'), { secret: process.env.JWT_SECRET || 'fallback-secret' });
const pool = require('./db');

(async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM users LIMIT 1');
    if (rows.length === 0) return console.log("No users found");
    const user = rows[0];
    
    // Fake sign using whatever secret is in .env
    require('dotenv').config();
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: user.id, companyId: user.company_id, userRole: user.role }, process.env.JWT_SECRET);
    
    const fetch = require('node-fetch'); // node 18+ has fetch natively, this is just to be safe. Wait, let's use built-in fetch if possible.
    const res = await fetch('http://127.0.0.1:3000/meetings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Test Meeting',
        scheduled_at: new Date().toISOString(),
        agenda: 'Test',
        project_id: '',
        meeting_link: '',
        attendees: [user.id]
      })
    });
    
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE:", text);
    
    process.exit(0);
  } catch (err) {
    console.error("TEST ERROR:", err);
    process.exit(1);
  }
})();
