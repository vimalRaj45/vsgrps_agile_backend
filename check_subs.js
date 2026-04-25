const pool = require('./db');

async function checkSubs() {
    try {
        const { rows } = await pool.query('SELECT user_id, COUNT(*) FROM push_subscriptions GROUP BY user_id');
        console.log('Push Subscriptions Summary:');
        console.table(rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSubs();
