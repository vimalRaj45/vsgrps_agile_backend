const pool = require('./db');

async function addPushTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                subscription JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, subscription)
            );
        `);
        console.log('✅ push_subscriptions table created successfully');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error creating push_subscriptions table:', err);
        process.exit(1);
    }
}

addPushTable();
