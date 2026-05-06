# Sprintora Backend Engine ⚙️

The neural heart of the Sprintora Workspace. A secure, high-performance, and multi-tenant Fastify API powering the AI-native agile experience.

## 🌟 Core Services

### 🧠 Neural Planning Engine
- **Llama-3 Powered**: Deep integration with Cloudflare AI Workers for near-instant requirement analysis.
- **Project Tracking**: Kanban boards with drag-and-drop support.
- **Smart Meetings**: Integrated meeting scheduling and documentation.
- **Advanced Reports**: Real-time project velocity and health metrics.

### 🏢 Multi-Tenant Infrastructure
- **Secure Isolation**: Strict row-level data segregation ensures zero data leakage between organizations.
- **Session Governance**: Secure, HTTP-only cookie management with 30-day "Remember Me" persistence.
- **RBAC Enforcement**: Fine-grained role-based permission checks on every API endpoint.

### 🤝 Communication & Logic
- **Real-time Notifications**: Centralized notification delivery system with bulk "Mark as Read" support.
- **Audit Logging**: Comprehensive tracking of all write operations and data access for compliance.
- **Resource Management**: Secure file handling with Gzipped organization backups and storage quota enforcement.

### 📧 Transactional Messaging
- **Brevo Integration**: Production-ready SMTP flow for account verification, password resets, and invite links.

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Fastify (Optimized for speed and low overhead)
- **Database**: PostgreSQL (Neon Serverless)
- **Query Engine**: Node-Postgres (Raw SQL for performance)
- **Authentication**: `fastify-session` + `fastify-cookie`
- **Security**: `fastify-helmet`, rate limiting, and SQL injection protection.
- **AI Engine**: Cloudflare AI Workers (Llama 3 8B)

## 📂 Repositories
- **Backend**: [https://github.com/vimalRaj45/vsgrps_agile_backend](https://github.com/vimalRaj45/vsgrps_agile_backend)
- **Frontend**: [https://github.com/vimalRaj45/vsgrps_agile_frontend](https://github.com/vimalRaj45/vsgrps_agile_frontend)

## 🚀 Setup & Installation

### Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=5000
DATABASE_URL=your_postgres_url
SESSION_SECRET=your_long_random_string
BREVO_API_KEY=your_brevo_key
BREVO_SENDER_EMAIL=your_verified_email
CLOUDFLARE_ACCOUNT_ID=your_id
CLOUDFLARE_AI_TOKEN=your_token
FRONTEND_URL=http://localhost:5173
```

### Installation Steps
1. **Clone & Install**:
   ```bash
   git clone https://github.com/vimalRaj45/vsgrps_agile_backend
   cd backend
   npm install
   ```
2. **Initialize Database**:
   ```bash
   node db-init.js
   ```
3. **Start Production Engine**:
   ```bash
   npm start
   ```

---
© 2026 Sprintora. All rights reserved.
