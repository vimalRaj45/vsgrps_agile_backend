const BASE_STYLE = `
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    color: #1e293b;
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
    background-color: #ffffff;
`;

const HEADER_STYLE = `
    padding-bottom: 20px;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 30px;
    text-align: center;
`;

const BUTTON_STYLE = `
    display: inline-block;
    padding: 14px 28px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: #ffffff !important;
    text-decoration: none;
    border-radius: 12px;
    font-weight: 800;
    font-size: 16px;
    margin-top: 25px;
    box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
`;

const FOOTER_STYLE = `
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #f1f5f9;
    font-size: 12px;
    color: #94a3b8;
    text-align: center;
`;

const LOGO_URL = "https://agile.vsgrps.com/favicon.png"; // Replace with your production logo URL

const LOGO_TEXT = `
    <div style="text-align: center; margin-bottom: 10px;">
        <img src="${LOGO_URL}" alt="Sprintora Logo" style="width: 48px; height: 48px; border-radius: 12px;" />
    </div>
    <h1 style="margin:0; color:#4f46e5; letter-spacing:-1px; font-weight:900;">Sprintora</h1>
`;

function wrapLayout(content) {
    return `
    <div style="background-color: #f8fafc; padding: 40px 0;">
        <div style="${BASE_STYLE}">
            <div style="${HEADER_STYLE}">
                ${LOGO_TEXT}
                <p style="margin:5px 0 0; font-size:12px; color:#64748b; text-transform:uppercase; font-weight:800; letter-spacing:1px;">AI-Powered Agile Hub</p>
            </div>
            ${content}
            <div style="${FOOTER_STYLE}">
                <p>© ${new Date().getFullYear()} VSGRPS Technologies. All rights reserved.</p>
                <p>This is an automated notification from Sprintora. Please do not reply to this email.</p>
            </div>
        </div>
    </div>
    `;
}

module.exports = {
    verification: (name, link) => wrapLayout(`
        <h2 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 15px;">Welcome to Sprintora, ${name}!</h2>
        <p>Thank you for joining our ecosystem of high-performance teams. To begin orchestrating your projects with AI precision, please verify your email address.</p>
        <div style="text-align: center;">
            <a href="${link}" style="${BUTTON_STYLE}">Verify My Account</a>
        </div>
        <p style="margin-top: 30px; font-size: 14px; color: #64748b;">If you didn't create an account with us, you can safely ignore this email.</p>
    `),

    resetPassword: (name, link) => wrapLayout(`
        <h2 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 15px;">Security Update</h2>
        <p>Hi ${name}, we received a request to reset the password for your Sprintora account. Click the button below to secure your workspace.</p>
        <div style="text-align: center;">
            <a href="${link}" style="${BUTTON_STYLE}">Reset Secure Password</a>
        </div>
        <p style="margin-top: 30px; font-size: 14px; color: #64748b;">The reset link will expire in 1 hour. If you didn't request this change, please contact your administrator immediately.</p>
    `),

    invitation: (companyName, inviterName, link) => wrapLayout(`
        <h2 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 15px;">Workspace Invitation</h2>
        <p><strong>${inviterName}</strong> has invited you to join the <strong>${companyName}</strong> workspace on Sprintora.</p>
        <p>Access your new dashboard and start collaborating with your team in real-time.</p>
        <div style="text-align: center;">
            <a href="${link}" style="${BUTTON_STYLE}">Join ${companyName}</a>
        </div>
        <p style="margin-top: 30px; font-size: 14px; color: #64748b;">Experience the power of AI-driven project management. See you inside!</p>
    `),

    otp: (otp) => wrapLayout(`
        <h2 style="font-size: 24px; font-weight: 800; color: #6366f1; margin-bottom: 15px; text-align: center;">Identity Verification</h2>
        <p style="text-align: center;">Use the one-time access code below to authorize your administrative session.</p>
        <div style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #1e1b4b; padding: 30px; background: #f1f5f9; border-radius: 16px; text-align: center; margin: 30px 0; border: 1px solid #e2e8f0;">
            ${otp}
        </div>
        <p style="text-align: center; font-size: 13px; color: #64748b;">This code is valid for 10 minutes. <strong>Do not share this code with anyone.</strong></p>
    `)
};
