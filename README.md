# Sprintora Workspace 🚀

A modern, secure, and multi-tenant SaaS platform designed for high-performance agile project management and organizational governance.

## 🌟 Project Overview
Sprintora is a comprehensive workspace solution that combines agile project tracking, team collaboration, and administrative governance into a single, high-fidelity platform. Built with a focus on security, scalability, and premium user experience, it allows organizations to manage projects, tasks, meetings, and shared resources with precision.

## 💎 Key Features

### 🏢 Multi-Tenant Architecture
- **Company Isolation**: Secure data segregation between different organizations.
- **Admin Governance**: Centralized management for company settings and team members.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions for Admins, Product Owners, Scrum Masters, Developers, and Stakeholders.

### 📋 Agile Project Management
- **Interactive Kanban Boards**: Real-time task tracking with priorities (Low to Critical) and statuses.
- **Project Pinning & Archiving**: Organize high-priority projects for quick access.
- **Subtask Management**: Break down complex tasks into manageable units.

### 🤝 Advanced Collaboration
- **Real-time Notifications**: In-app notification bell and browser-native Push Notifications (PWA).
- **Interactive Comments**: Mention teammates (@username) in comments with automated alerts.
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
- **Email Verification**: Secure registration flow powered by Brevo.
- **Session Security**: Secure, HTTP-only cookie-based session management.
- **Production Hardening**: Rate limiting, SQL injection protection, and user enumeration prevention.

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
- **External APIs**: Brevo (SMTP/Email), Open-Graph-Scraper

## 📂 Project Repositories

- **Backend**: [https://github.com/vimalRaj45/Sprintora_agile_backend](https://github.com/vimalRaj45/Sprintora_agile_backend)
- **Frontend**: [https://github.com/vimalRaj45/Sprintora_agile_frontend](https://github.com/vimalRaj45/Sprintora_agile_frontend)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database
- Brevo API Key (for emails)
- Groq API Key (for AI)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/vimalRaj45/Sprintora_agile_backend
   git clone https://github.com/vimalRaj45/Sprintora_agile_frontend
   ```

2. **Backend Setup**:
   ```bash
   cd backend
   npm install
   # Create .env with DATABASE_URL, GMAIL_USER, GMAIL_PASS, SESSION_SECRET, GROQ_API_KEY
   node db-init.js  # Initialize the database schema
   node index.js
   ```

3. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## 🎨 Design System
The project follows a **Premium Dark Mode** aesthetic by default, featuring:
- **Glassmorphism**: Translucent headers and cards.
- **Dynamic Gradients**: Modern blue-to-cyan accents.
- **Micro-animations**: Smooth hover transitions and scroll reveals.
- **Mobile First**: Fully responsive layout optimized for touch targets and small screens.

---
© 2026 Sprintora. Managed and developed by Antigravity AI.
