const webpush = require('web-push');
const pool = require('../db');
const dotenv = require('dotenv');

dotenv.config();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    try {
        console.log(`📡 VAPID Setup: Public(${VAPID_PUBLIC_KEY.trim().length} chars), Private(${VAPID_PRIVATE_KEY.trim().length} chars)`);
        webpush.setVapidDetails(
            'mailto:vsgrpsemail@gmail.com',
            VAPID_PUBLIC_KEY.trim(),
            VAPID_PRIVATE_KEY.trim()
        );
        console.log('✅ VAPID details set successfully');
    } catch (err) {
        console.error('❌ Failed to set VAPID details:', err.message);
    }
} else {
    console.warn("⚠️ VAPID keys missing from .env. Push notifications will be disabled.");
}

async function sendPushNotification(userId, payload) {
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
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log(`🗑️ Subscription expired/invalid for user ${userId}, removing...`);
                    await pool.query(
                        'DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription = $2',
                        [userId, JSON.stringify(sub.subscription)]
                    );
                } else {
                    console.error(`❌ Push error for user ${userId}:`, err.message, err.body || '');
                }
            }
        });

        await Promise.all(pushPromises);
    } catch (err) {
        console.error('❌ Global push error:', err);
    }
}

async function broadcastPushNotification(companyId, payload) {
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
                if (err.statusCode === 404 || err.statusCode === 410) {
                    console.log(`🗑️ Expired subscription for user ${sub.user_id}, removing...`);
                    await pool.query(
                        'DELETE FROM push_subscriptions WHERE user_id = $1 AND subscription = $2',
                        [sub.user_id, JSON.stringify(sub.subscription)]
                    );
                } else {
                    console.error(`❌ Broadcast push error for user ${sub.user_id}:`, err.message);
                }
            }
        });

        await Promise.all(pushPromises);
    } catch (err) {
        console.error('❌ Broadcast push error:', err);
    }
}

module.exports = { sendPushNotification, broadcastPushNotification };
