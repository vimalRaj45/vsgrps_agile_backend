const webpush = require('web-push');
const pool = require('../db');
const dotenv = require('dotenv');

dotenv.config();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
        webpush.setVapidDetails(
            'mailto:vsgrpsemail@gmail.com',
            VAPID_PUBLIC_KEY.trim(),
            VAPID_PRIVATE_KEY.trim()
        );
        console.log('📡 VAPID details configured for push notifications');
    } catch (err) {
        console.error('❌ Failed to set VAPID details:', err.message);
    }
} else {
    console.warn("⚠️ VAPID keys missing from environment. Push notifications are disabled.");
}

async function sendPushNotification(userId, payload) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('❌ Push failed: VAPID keys missing from environment');
        return;
    }
    try {
        const { rows: subscriptions } = await pool.query(
            'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
            [userId]
        );

        if (subscriptions.length === 0) {
            console.log(`ℹ️ No push subscriptions found for user ${userId}`);
            return;
        }

        const notificationPayload = JSON.stringify(payload);

        const pushPromises = subscriptions.map(async (sub) => {
            try {
                const result = await webpush.sendNotification(sub.subscription, notificationPayload);
                console.log(`✅ Push sent successfully to user ${userId}. Status: ${result.statusCode}`);
            } catch (err) {
                console.error(`❌ Push delivery failed for user ${userId}:`, err.message);
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log(`🗑️ Subscription expired/invalid for user ${userId}, removing...`);
                    // Use JSONB comparison or ID to delete
                    await pool.query(
                        'DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription = $2::jsonb',
                        [userId, JSON.stringify(sub.subscription)]
                    );
                } else if (err.body) {
                    console.error('Push Error Body:', err.body);
                }
            }
        });

        await Promise.all(pushPromises);
    } catch (err) {
        console.error('❌ Global push error:', err);
    }
}

async function broadcastPushNotification(companyId, payload) {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('❌ Broadcast push failed: VAPID keys missing from environment');
        return;
    }
    try {
        const { rows: subscriptions } = await pool.query(
            'SELECT ps.subscription, ps.user_id FROM push_subscriptions ps JOIN users u ON ps.user_id = u.id WHERE u.company_id = $1',
            [companyId]
        );

        const notificationPayload = JSON.stringify(payload);

        const pushPromises = subscriptions.map(async (sub) => {
            try {
                const result = await webpush.sendNotification(sub.subscription, notificationPayload);
                console.log(`✅ Broadcast push sent successfully to user ${sub.user_id}. Status: ${result.statusCode}`);
            } catch (err) {
                console.error(`❌ Broadcast delivery failed for user ${sub.user_id}:`, err.message);
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log(`🗑️ Expired subscription for user ${sub.user_id}, removing...`);
                    await pool.query(
                        'DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription = $2::jsonb',
                        [sub.user_id, JSON.stringify(sub.subscription)]
                    );
                } else if (err.body) {
                    console.error('Broadcast Push Error Body:', err.body);
                }
            }
        });

        await Promise.all(pushPromises);
    } catch (err) {
        console.error('❌ Broadcast push error:', err);
    }
}

module.exports = { sendPushNotification, broadcastPushNotification };
