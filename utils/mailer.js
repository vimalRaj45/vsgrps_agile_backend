const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;
const GMAIL_SENDER_NAME = process.env.GMAIL_SENDER_NAME || "VSGRPS";

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS
    }
});

async function sendMail({ to, subject, html }) {
    if (!GMAIL_USER || !GMAIL_PASS) {
        console.warn("⚠️ Gmail credentials not found in .env");
        return;
    }

    const mailOptions = {
        from: `"${GMAIL_SENDER_NAME}" <${GMAIL_USER}>`,
        to,
        subject,
        html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error("❌ Nodemailer Error:", error);
        throw error;
    }
}

module.exports = { sendMail };
