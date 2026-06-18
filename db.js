require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ CRITICAL: DATABASE_URL is missing from environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Wrap pool.query and pool.connect to intercept audit_log insertions and auto-delete old logs
const originalQuery = pool.query.bind(pool);
pool.query = async function (config, params) {
  const result = await originalQuery(config, params);
  
  let queryString = '';
  if (typeof config === 'string') {
    queryString = config;
  } else if (config && typeof config.text === 'string') {
    queryString = config.text;
  }
  
  if (queryString.toUpperCase().includes('INSERT INTO AUDIT_LOG')) {
    originalQuery("DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '5 days'")
      .catch(err => console.error('Error during auto-cleanup of audit logs:', err));
  }
  
  return result;
};

const originalConnect = pool.connect.bind(pool);
pool.connect = async function () {
  const client = await originalConnect();
  const originalClientQuery = client.query.bind(client);
  
  client.query = async function (config, params) {
    const result = await originalClientQuery(config, params);
    
    let queryString = '';
    if (typeof config === 'string') {
      queryString = config;
    } else if (config && typeof config.text === 'string') {
      queryString = config.text;
    }
    
    if (queryString.toUpperCase().includes('INSERT INTO AUDIT_LOG')) {
      originalQuery("DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '5 days'")
        .catch(err => console.error('Error during auto-cleanup of audit logs:', err));
    }
    
    return result;
  };
  
  return client;
};

module.exports = pool;
