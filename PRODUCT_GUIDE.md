# VSGRPS Agile Workspace - Product Guide 📘

Welcome to the **VSGRPS Agile Workspace**. This guide provides a comprehensive walkthrough of the platform's features, workflows, and administrative controls.

---

## 🚀 1. Getting Started

### Registration & Onboarding
1. **Create an Organization**: The first user to register creates the "Company" entity and is automatically assigned the **Admin** role.
2. **Email Verification**: A verification link will be sent to your email. You must verify your account before you can log in.
3. **Invite Your Team**: Navigate to the **Team** section to send invite links to your colleagues.

### Authentication
- **Secure Sessions**: The platform uses HTTP-only, secure session cookies.
- **Remember Me**: Check this during login to keep your session active for 30 days.

---

## 📋 2. Agile Project Management

### Projects
- **Creation**: Admins and Product Owners can create new projects.
- **Pinning**: Use the "Pin" icon on the dashboard to keep high-priority projects at the top of your view.
- **Archiving**: Completed projects can be archived to keep the workspace clean while preserving historical data.

### Kanban Board
- **Task Creation**: Add tasks with titles, descriptions, priorities, and assigned members.
- **Workflow**: Move tasks through **To Do**, **In Progress**, **Review**, and **Done**.
- **Enforcements**: Only Admins can mark a task as "Done" to ensure quality control. Developers can update the status of tasks assigned to them.

### Subtasks
- Break down large tasks into smaller action items.
- Subtasks can be checked off individually to track granular progress.

---

## 🤖 3. AI Architect (Llama-3.3 Powered)

The AI Architect is your co-pilot for agile planning.

### Automated Task Breakdown
1. Open any project and click **"AI Suggest Tasks"**.
2. Enter a high-level requirement (e.g., "Build a secure user login system").
3. The AI will generate a structured list of tasks, including:
   - Descriptive titles and technical details.
   - Smart priority assignments.
   - Estimated hours and recommended roles.
   - Pre-defined subtasks for each task.
4. **Bulk Creation**: Review the suggestions and click "Create All" to instantly populate your project board.

---

## 🤝 4. Collaboration Tools

### Team Communication
- **Task Comments**: Discuss specific tasks within the task detail view.
- **Mentions (@)**: Type `@` followed by a teammate's name to mention them. They will receive an instant notification.
- **Notification Bell**: Tracks all your mentions, task assignments, and system alerts.

### Resource Sharing
- **Private Files**: Upload project assets and share them with specific team members or the entire organization.
- **Link Vault**: Save important URLs (Documentation, Figma, Staging) with automatic metadata preview.

### Meetings
- **Scheduling**: Organize meetings with specific agendas and dates.
- **Attendance**: Track who was present.
- **Interactive Notes**: Store meeting outcomes and action items directly within the project context.

---

## 📊 5. Dashboards & Analytics

### Executive View
- High-level project health cards.
- Quick links to recently accessed projects.

### Performance Analytics
- **Team Velocity**: A bar chart showing task completion trends over the last 12 weeks.
- **Work Distribution**: Visual breakdown of work assigned vs. work completed per user.

---

## 🛡️ 6. Administration & Governance

### Team Management
- **Role Hierarchy**:
  - **Admin**: Full control over company settings, users, and all project data.
  - **Product Owner/Scrum Master**: Manage project scope, tasks, and team assignments.
  - **Developer**: Update task status and manage subtasks on assigned items.
  - **Stakeholder**: View-only access to progress and reports.

### Data Portability (Backups)
- **Organization Backup**: Admins can generate a full database export of their company's data at any time.
- **Master Portal**: Restricted to system owners (via OTP), allowing for global system maintenance.

### Audit Logging
- Every sensitive action (deleting a project, removing a user, downloading a backup) is recorded in the **Audit Log** for compliance and security reviews.

---

## 📱 7. PWA & Mobile Experience

- **Installable**: Add VSGRPS Agile to your home screen via your browser's "Add to Home Screen" prompt.
- **Responsive Design**: The entire interface is optimized for mobile, tablet, and desktop viewports.
- **Push Notifications**: Enable notifications in your browser settings to receive real-time alerts even when the app is closed.

---

© 2026 VSGRPS Agile. All rights reserved.
