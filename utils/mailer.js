const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const BREVO_USER = process.env.BREVO_USER;
const BREVO_PASS = process.env.BREVO_PASS;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "VSGRPS";

async function sendMail({ to, subject, html }) {
    if (!BREVO_USER || !BREVO_PASS) {
        console.warn("⚠️ Brevo credentials not found in .env");
        return;
    }

    try {
        const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: {
                name: BREVO_SENDER_NAME,
                email: BREVO_USER
            },
            to: [{ email: to }],
            subject: subject,
            htmlContent: html
        }, {
            headers: {
                'api-key': BREVO_PASS,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log(`✅ Email sent via Brevo API: ${response.data.messageId}`);
        return response.data;
    } catch (error) {
        console.error("❌ Brevo API Error:", error.response ? error.response.data : error.message);
        throw error;
    }
}

module.exports = { sendMail };
