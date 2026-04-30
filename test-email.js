const { sendMail } = require('./utils/mailer');

async function test() {
    try {
        console.log("🚀 Starting email test...");
        await sendMail({
            to: 'vimalraj5207@gmail.com',
            subject: 'Test Email from Brevo API',
            html: `
                <h1>Brevo API Test</h1>
                <p>This is a test email sent using the Brevo API and Axios from your VSGRPS Agile Workspace.</p>
                <p>If you received this, the transition from Gmail/Nodemailer was successful!</p>
                <hr>
                <p><small>Sent at: ${new Date().toLocaleString()}</small></p>
            `
        });
        console.log("🏁 Test completed successfully!");
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

test();
