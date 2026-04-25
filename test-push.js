const { sendPushNotification } = require('./utils/push');
const pool = require('./db');

async function testPush() {
    const userEmail = process.argv[2];
    if (!userEmail) {
        console.log('Usage: node test-push.js <email>');
        process.exit(1);
    }

    try {
        const { rows: users } = await pool.query('SELECT id FROM users WHERE email = $1', [userEmail]);
        if (users.length === 0) {
            console.error(`❌ User with email ${userEmail} not found`);
            process.exit(1);
        }

        const userId = users[0].id;
        console.log(`🚀 Sending test push to user ID: ${userId} (${userEmail})`);

        await sendPushNotification(userId, {
            title: 'Test Notification',
            body: 'If you see this, web-push is working correctly! 🎉',
            icon: '/favicon.svg',
            data: { url: '/' }
        });

        console.log('✅ Push sent command finished. Check browser console and system notifications.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test push failed:', err);
        process.exit(1);
    }
}

testPush();
