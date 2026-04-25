const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { Readable, pipeline } = require('stream');
const zlib = require('zlib');
const { promisify } = require('util');

const pipe = promisify(pipeline);

async function backupRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  const formatValue = (val) => {
    if (val === null) return 'NULL';
    if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
    if (val instanceof Date) return `'${val.toISOString()}'`;
    if (Buffer.isBuffer(val)) return `'\\x${val.toString('hex')}'`;
    if (Array.isArray(val)) return `ARRAY[${val.map(v => `'${v.replace(/'/g, "''")}'`).join(',')}]`;
    if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
    return val;
  };

  async function* generateBackup(queries) {
    yield `-- VSGRPS Enterprise Backup\n`;
    yield `-- Generated at: ${new Date().toISOString()}\n`;
    yield `BEGIN;\n\n`;

    for (const table of queries) {
      const { rows } = await pool.query(table.query, table.filter || []);
      if (rows.length > 0) {
        yield `-- Table: ${table.name}\n`;
        for (const row of rows) {
          const cols = Object.keys(row).join(', ');
          const vals = Object.values(row).map(formatValue).join(', ');
          yield `INSERT INTO ${table.name} (${cols}) VALUES (${vals}) ON CONFLICT DO NOTHING;\n`;
        }
        yield `\n`;
      }
    }
    yield `COMMIT;\n`;
  }

  fastify.get('/sql', { preHandler: [authorize('audit:view')] }, async (req, reply) => {
    const { companyId } = req.session;
    if (req.session.userRole !== 'Admin') return reply.code(403).send({ error: 'Forbidden' });

    const queries = [
      { name: 'companies', query: 'SELECT * FROM companies WHERE id = $1', filter: [companyId] },
      { name: 'users', query: 'SELECT * FROM users WHERE company_id = $1', filter: [companyId] },
      { name: 'invites', query: 'SELECT * FROM invites WHERE company_id = $1', filter: [companyId] },
      { name: 'projects', query: 'SELECT * FROM projects WHERE company_id = $1', filter: [companyId] },
      { name: 'project_members', query: 'SELECT pm.* FROM project_members pm JOIN projects p ON pm.project_id = p.id WHERE p.company_id = $1', filter: [companyId] },
      { name: 'tasks', query: 'SELECT * FROM tasks WHERE company_id = $1', filter: [companyId] },
      { name: 'subtasks', query: 'SELECT st.* FROM subtasks st JOIN tasks t ON st.task_id = t.id WHERE t.company_id = $1', filter: [companyId] },
      { name: 'task_labels', query: 'SELECT * FROM task_labels WHERE company_id = $1', filter: [companyId] },
      { name: 'task_label_assignments', query: 'SELECT tla.* FROM task_label_assignments tla JOIN tasks t ON tla.task_id = t.id WHERE t.company_id = $1', filter: [companyId] },
      { name: 'task_comments', query: 'SELECT tc.* FROM task_comments tc JOIN tasks t ON tc.task_id = t.id WHERE t.company_id = $1', filter: [companyId] },
      { name: 'meetings', query: 'SELECT * FROM meetings WHERE company_id = $1', filter: [companyId] },
      { name: 'meeting_attendees', query: 'SELECT ma.* FROM meeting_attendees ma JOIN meetings m ON ma.meeting_id = m.id WHERE m.company_id = $1', filter: [companyId] },
      { name: 'meeting_notes', query: 'SELECT mn.* FROM meeting_notes mn JOIN meetings m ON mn.meeting_id = m.id WHERE m.company_id = $1', filter: [companyId] },
      { name: 'files', query: 'SELECT * FROM files WHERE company_id = $1', filter: [companyId] },
      { name: 'links', query: 'SELECT * FROM links WHERE company_id = $1', filter: [companyId] },
      { name: 'notifications', query: 'SELECT * FROM notifications WHERE company_id = $1', filter: [companyId] },
      { name: 'audit_log', query: 'SELECT * FROM audit_log WHERE company_id = $1', filter: [companyId] }
    ];

    const stream = Readable.from(generateBackup(queries)).pipe(zlib.createGzip());
    
    return reply
      .header('Content-Type', 'application/gzip')
      .header('Content-Disposition', `attachment; filename="backup_${Date.now()}.sql.gz"`)
      .send(stream);
  });

  fastify.get('/master', async (req, reply) => {
    if (!req.session.isSuperAdmin) return reply.code(403).send({ error: 'Unauthorized' });

    const tables = [
      'companies', 'users', 'invites', 'projects', 'project_members', 
      'tasks', 'subtasks', 'task_labels', 'task_label_assignments', 
      'task_comments', 'meetings', 'meeting_attendees', 'meeting_notes', 
      'files', 'links', 'notifications', 'audit_log'
    ];

    const queries = tables.map(name => ({ name, query: `SELECT * FROM ${name}` }));
    const stream = Readable.from(generateBackup(queries)).pipe(zlib.createGzip());

    return reply
      .header('Content-Type', 'application/gzip')
      .header('Content-Disposition', `attachment; filename="master_backup_${Date.now()}.sql.gz"`)
      .send(stream);
  });
}

module.exports = backupRoutes;
