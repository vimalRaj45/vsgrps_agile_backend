require('dotenv').config({ path: '../.env' });
const pool = require('../db');
const { seedStandardRoles } = require('../utils/rbac');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Fetching all companies...');
    const { rows: companies } = await client.query('SELECT id FROM companies');
    console.log(`Found ${companies.length} companies.`);

    await client.query('BEGIN');

    for (const company of companies) {
      console.log(`Seeding roles for company: ${company.id}`);
      // Check if standard roles already exist to prevent duplicates
      const { rows: existingRoles } = await client.query(
        'SELECT name FROM custom_roles WHERE company_id = $1 AND is_system = true',
        [company.id]
      );
      if (existingRoles.length === 0) {
        await seedStandardRoles(client, company.id);
        console.log(`- Seeded standard roles for company ${company.id}`);
      } else {
        console.log(`- Company ${company.id} already has standard roles. Skipping.`);
      }
    }

    await client.query('COMMIT');
    console.log('Seeding completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding roles:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
