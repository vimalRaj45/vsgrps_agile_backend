# Project Flow & Analysis: Sprintora (VSGRPS Agile)

This document provides a comprehensive overview of the Sprintora project architecture, the analysis of recent authentication issues, and the implemented solutions.

---

## 1. Project Overview
**Sprintora** is an AI-powered Agile Hub designed for organization management, project tracking, and team collaboration.

- **Frontend**: React (Vite) + Material UI (MUI).
- **Backend**: Node.js (Fastify) + PostgreSQL (Neon).
- **Session Management**: `@fastify/session` with PostgreSQL store.
- **Storage**: Cloudflare R2 for file assets.
- **Messaging**: Brevo for emails and VAPID for Web Push notifications.

---

## 2. System Architecture

### Frontend Layer
- **State Management**: React Context API (`AuthContext`, `NotificationContext`, `ThemeContext`).
- **Routing**: `react-router-dom` with `PrivateRoute` and `PublicRoute` wrappers.
- **API Client**: Axios instance with `withCredentials: true` for session cookie handling.
- **Real-time**: Polling mechanisms for notifications (10s) and storage metrics (30s).

### Backend Layer
- **Framework**: Fastify (selected for performance and low overhead).
- **Security**: CORS protection, Rate Limiting, and Session-based Authentication.
- **Database**: PostgreSQL with `pg` pool.
- **Session Persistence**: Custom `PostgresStore` to maintain user sessions across server restarts.

---

## 3. Deep Analysis: The "401 Unauthorized" Issue

### Symptoms
Users reported multiple `401 Unauthorized` errors in the browser console, specifically for:
- `GET /notifications`
- `GET /files/storage`
- "Failed to fetch storage" errors.

### Root Cause Analysis
1. **Short Session Window**: The default session was set to 2 hours. If a user left the tab open without checking "Remember Me", the session would expire, causing background polling to fail.
2. **Aggressive Polling**: `TopBar.jsx` and `Sidebar.jsx` were polling `/files/storage` even if the user state was potentially invalid or the component was in the process of unmounting.
3. **Cookie Mismatch**: In production, the backend (`onrender.com`) and frontend (`vsgrps.com`) are on different root domains. This requires strict `SameSite: None` and `Secure: true` settings, which were occasionally inconsistently applied.
4. **Console Clutter**: Frontend components were logging full error objects to the console for expected session expiries, leading to a poor developer/user experience.

---

## 4. Implemented Solutions

### Backend Enhancements (`backend/index.js`)
- **Extended Sessions**: Increased the default session `maxAge` to **24 hours**.
- **Session Optimization**: Set `saveUninitialized: false` to prevent the database from being flooded with empty session records for guest visitors.
- **Robust Cookies**: Standardized `SameSite: None` and `Secure: true` for all production environments to ensure cross-domain cookie delivery.
- **CORS Cleanup**: Removed duplicate origins to optimize preflight requests.

### Frontend Resilience (`frontend/src/...`)
- **Conditional Polling**: Added `if (!user) return;` checks to all `useEffect` hooks in `TopBar`, `Sidebar`, and `NotificationContext`.
- **Silent Failures**: Modified catch blocks to ignore `401` errors specifically. If a 401 occurs, the `AuthContext` interceptor handles the logout, and the components stop logging redundant errors.
- **Immediate Logout**: Updated `AuthContext.jsx` to clear the local `user` state **immediately** when the logout function is called, ensuring the UI redirects instantly.

---

## 5. Deployment & Repository Structure

The project is split into two independent repositories for better scalability and deployment on platforms like Render/Vercel:

1. **Frontend**: [vimalRaj45/vsgrps_agile_frontend](https://github.com/vimalRaj45/vsgrps_agile_frontend)
2. **Backend**: [vimalRaj45/vsgrps_agile_backend](https://github.com/vimalRaj45/vsgrps_agile_backend)

### Deployment Flow
1. Developer pushes to `main`.
2. Render detects changes in the Backend repository and redeploys the Fastify service.
3. Vercel/Render detects changes in the Frontend repository, builds the Vite app, and deploys the static assets.

---

## 6. Current Status & Next Steps
- [x] Fix 401 Console Errors.
- [x] Extend Session Life.
- [x] Optimize Database Session Store.
- [x] Synchronize GitHub Repositories.
- [ ] **Next**: Implement automated cleanup for orphaned files in R2 storage.
- [ ] **Next**: Enhance AI suggestions for task prioritization in the Dashboard.

---
*Created by Antigravity AI Assistant - April 2026*
