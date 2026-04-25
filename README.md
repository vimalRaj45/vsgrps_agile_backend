# VSGRPS Agile Workspace 🚀

A modern, secure, and multi-tenant SaaS platform designed for high-performance agile project management and organizational governance.

## 🌟 Project Overview
VSGRPS Agile is a comprehensive workspace solution that combines agile project tracking, team collaboration, and administrative governance into a single, high-fidelity platform. Built with a focus on security, scalability, and premium user experience, it allows organizations to manage projects, tasks, meetings, and shared resources with precision.

## 💎 Key Features

### 🏢 Multi-Tenant Architecture
- **Company Isolation**: Secure data segregation between different organizations.
- **Admin Governance**: Centralized management for company settings and team members.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Admins, Product Owners, Scrum Masters, Developers, and Stakeholders.

### 📋 Agile Project Management
- **Interactive Kanban Boards**: Real-time task tracking with priorities (Low to Critical) and statuses.
- **Project Pining & Archiving**: Organize high-priority projects for quick access.
- **Subtask Management**: Break down complex tasks into manageable units.

### 🤝 Advanced Collaboration
- **Meeting Management**: Schedule meetings, track attendees, and store interactive meeting notes.
- **Internal Sharing**: Private file and link sharing with specific team members.
- **Global Search**: Unified search across tasks, projects, and meetings.

### 🤖 AI Architect (Next-Gen Agile)
- **Automatic Task Breakdown**: Decompose complex requirements into structured tasks using Llama-3.3.
- **Smart Estimation**: Automatic priority and effort estimation based on requirement context.
- **Subtask Provisioning**: AI generates nested subtasks that can be bulk-created instantly.

### 📊 Advanced Analytics & Dashboards
- **Team Velocity Tracking**: 12-week rolling visualization of task completion trends.
- **User Performance Tracking**: Real-time visualization of work done vs. pending.
- **Executive Stakeholder View**: Simplified, high-level dashboard for non-technical stakeholders.

### 📦 Enterprise Data Portability
- **Organization Backups**: Export entire datasets as compressed `.sql.gz` files.
- **Optimized Streaming**: Memory-efficient streaming architecture with on-the-fly Gzip compression.
- **Master Access Portal**: System-wide global backup restricted via an OTP-secured portal.

### 📁 File & Resource Management
- **Secure File Uploads**: Integrated storage for project-related assets.
- **Storage Quotas**: Organizational limits (10MB default) with real-time usage tracking.
- **Link Pinning**: Save and share important project links with Open Graph metadata scraping.

### 🛡️ Security & Audit
- **Comprehensive Audit Logs**: Every critical action (uploads, deletions, removals) is tracked for compliance.
- **Email Verification**: Secure registration flow powered by Nodemailer Gmail Service.
- **Session Security**: Secure, HTTP-only cookie-based session management.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: Material UI v6 (Vanilla CSS logic for custom aesthetics)
- **Animations**: Framer Motion & Lottie-React
- **State/Routing**: React Context API & React Router v7
- **Icons**: MUI Icons & Lucide

### Backend
- **Runtime**: Node.js (Fastify Framework)
- **Database**: PostgreSQL (Neon Serverless)
- **AI Engine**: Groq API (Llama-3.3-70B-versatile)
- **Authentication**: Secure Session-based Auth (fastify-session)
- **External APIs**: Nodemailer Gmail Service, Open-Graph-Scraper

## 📂 Project Structure

```text
/
├── frontend/               # React + Vite application
│   ├── src/components/     # Reusable UI components (Performance, Health, etc.)
│   ├── src/pages/          # Page views (Dashboard, Settings, etc.)
│   └── src/context/        # Auth and Theme state management
├── backend/                # Fastify server
│   ├── routes/             # API endpoints (Auth, Dashboard, Tasks, etc.)
│   ├── middleware/         # Auth and validation hooks
│   └── db-init.js          # Database schema and initialization
└── README.md               # Project documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Gmail App Password (for Nodemailer)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vimalRaj45/vsgrps_agile_backend
   git clone https://github.com/vimalRaj45/vsgrps_agile_frontend
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   npm install
   # Create .env with DATABASE_URL, GMAIL_USER, GMAIL_PASS, SESSION_SECRET
   npm run init-db  # Initialize the database schema
   npm run dev
   ```

3. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   # Configure baseURL in api/client.js
   npm run dev
   ```

## 🎨 Design System
The project follows a **Premium Dark Mode** aesthetic by default, featuring:
- **Glassmorphism**: Translucent headers and cards.
- **Dynamic Gradients**: Modern blue-to-cyan accents.
- **Micro-animations**: Smooth hover transitions and scroll reveals.
- **Mobile First**: Fully responsive layout optimized for touch targets and small screens.

## 📜 Recent Production Hardening (Final Version)
- **Hardened RBAC (Agile Master)**: Implemented strict operational boundaries. Developers are restricted to status updates and subtasks on assigned items, while Admins/POs manage core scope and deadlines.
- **Visual Task Timelines**: Integrated dynamic progress bars on task cards that visualize "time consumed" relative to deadlines, with color-coded urgency (Blue → Orange → Red).
- **AI Architect v2**: Added automatic deadline estimation and bulk due-date assignment for generated tasks.
- **Personalized Focus**: Introduced the "Your Tasks" filter to help users isolate their responsibilities with a single click.
- **Enterprise UI Fixes**: Resolved all mobile layout regressions and runtime ReferenceErrors for a stable production-grade experience.
- **Backups & Security**: Finalized streaming Gzip-compressed organization exports and OTP-gated administrative portals.

---
© 2026 VSGRPS Agile. Managed and developed by Antigravity AI.
