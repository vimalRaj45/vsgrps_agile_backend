# Project Flow & Analysis: Sprintora (VSGRPS Agile)
**Version:** 1.1.0  
**Status:** Production  
**Document Type:** Technical Architecture & Engineering Flow  

---

## 1. Project Overview
**Sprintora** is a high-performance, AI-integrated SaaS platform designed to streamline Agile project management. It provides a centralized hub for organizational structure, task orchestration, real-time collaboration, and data-driven insights. Built for scalability, the platform serves as a mission-control center for teams requiring precise tracking and automated workflows.

---

## 2. System Architecture

### Frontend Layer
- **Core Engine**: React 18+ powered by Vite for optimized build cycles and Hot Module Replacement (HMR).
- **Design System**: Material UI (MUI) utilizing a custom-themed design language for consistent UX across modules.
- **State Orchestration**: 
    - **Context API**: Decentralized state management for Authentication, Notifications, and Theme preferences.
    - **Axios Middleware**: A centralized HTTP client configured with interceptors for global error handling and session synchronization.
- **Real-time Synchronization**: Strategic polling and event-driven updates for high-frequency data (notifications, storage metrics).

### Backend Layer
- **Runtime**: Node.js utilizing the Fastify framework for its industry-leading overhead efficiency and plugin-based architecture.
- **Data Persistence**: PostgreSQL hosted on Neon, leveraging serverless scale-to-zero capabilities and connection pooling.
- **Session Management**: Distributed session handling via `@fastify/session` using a custom PostgreSQL store (`JSONB` format) for persistence across horizontal scaling.
- **Asset Storage**: Cloudflare R2 (S3-compatible) for distributed, low-latency binary large object (BLOB) storage.

---

## 3. Request & Data Flow
The lifecycle of a typical user request follows a strict tiered path:

1.  **Ingress**: Request hits the Render/Vercel edge network (HTTPS termination).
2.  **CORS Validation**: Fastify `@fastify/cors` plugin validates the `Origin` header against an allow-list.
3.  **Session Decryption**: `@fastify/cookie` parses the signed session ID; `@fastify/session` retrieves the session data from Postgres.
4.  **Pre-Handler Hooks**: Authentication and Authorization middlewares (`authenticate`, `authorize`) verify `userId` and RBAC (Role-Based Access Control).
5.  **Business Logic**: Route handlers process the request, interacting with the DB or R2 storage.
6.  **Egress**: Response is serialized to JSON and sent with updated session headers if required.

---

## 4. Authentication & Session Flow

### Auth Lifecycle (Text Representation)
`User -> POST /auth/login -> Backend Validates -> Create Session in DB -> Set-Cookie (HTTP-only, Secure) -> Frontend Receives -> AuthContext Updates State -> Protected Routes Accessible`

### Technical Implementation
- **Session Persistence**: Sessions are stored in a `sessions` table in Postgres, ensuring that server restarts do not log out users.
- **Security Headers**: Cookies are configured with `httpOnly: true` (prevent XSS access) and `Secure: true` (HTTPS only).
- **Cross-Domain Strategy**: Since the frontend and backend reside on different root domains, we utilize `SameSite: None` to allow cross-site credentialed requests.

---

## 5. Error Handling Strategy
Sprintora employs a multi-layered error recovery strategy:
- **Global Backend Handler**: A centralized Fastify error handler catches unhandled exceptions, sanitizes sensitive data, and returns standardized JSON error responses.
- **Frontend Interceptors**: Axios response interceptors detect `401 Unauthorized` errors globally, triggering an immediate state cleanup and redirecting to the landing page.
- **Graceful Degradation**: Polling mechanisms (notifications/storage) fail silently to the user while logging non-critical errors to internal telemetry.

---

## 6. Performance Optimization Techniques
- **Database Indexing**: Critical paths (tasks, notifications, sessions) are indexed for sub-millisecond retrieval.
- **Lazy Loading**: React components and heavy utilities (e.g., Push Manager) are loaded asynchronously via dynamic imports.
- **Rate Limiting**: Protection against DDoS and brute-force attacks via `@fastify/rate-limit`, restricted by IP and session.
- **R2 Edge Caching**: Assets are served via Cloudflare’s CDN to minimize latency for global users.

---

## 7. Security Considerations
- **Data at Rest**: Passwords hashed using `bcrypt` with a salt factor of 10.
- **Data in Transit**: Mandatory TLS 1.3 for all API and DB communications.
- **Input Sanitization**: Strict schema validation for all incoming request bodies to prevent SQL injection and XSS.
- **CSRF Mitigation**: While using `SameSite: None`, we rely on strict `Origin` header validation and `httpOnly` flags.

---

## 8. Deployment Architecture & CI/CD Flow
- **Environment Separation**: Distinct `production` and `development` environments managed via encrypted `.env` files.
- **Frontend Hosting**: Deployed on Vercel/Render for edge delivery of static assets.
- **Backend Hosting**: Deployed on Render Web Services with `trustProxy: true` for accurate header parsing.
- **Pipeline**:
    1. Git Push -> 2. GitHub Actions (Lint/Test) -> 3. Automated Deploy to Render/Vercel.

---

## 9. Repository Structure Strategy
The project follows a **Monorepo-lite** structure, managed as two distinct Git repositories to decouple deployment lifecycles:
- `/frontend`: Isolated React application, dependencies, and UI assets.
- `/backend`: Fastify server, database migrations, and infrastructure scripts.
- **Shared Logic**: Standardized API contracts ensure seamless integration between the two repositories.

---

## 10. Observability & Logging
- **Structured Logging**: Fastify `pino` logger provides JSON-formatted logs for easy ingestion into monitoring tools.
- **Audit Logs**: A dedicated `audit_log` table tracks all sensitive organizational changes (user removal, file deletions, project updates).
- **Session Telemetry**: Custom logging in the `PostgresStore` monitors session lookup failures to identify potential cookie/domain issues.

---

## 11. Common Production Issues and How They Were Resolved

### 401 Unauthorized / Session Drops
- **Issue**: Users were intermittently logged out, and background polling caused 401 noise in the console.
- **Resolution**: Increased session `maxAge` to 24 hours and implemented `saveUninitialized: false` to prevent session clutter. Added `if (!user)` guards to frontend polling.

### CORS & SameSite Cookie Blocking
- **Issue**: Modern browsers (Chrome/Safari) blocked cookies because the frontend and backend were on different root domains.
- **Resolution**: Explicitly configured `SameSite: None` and `Secure: true` in the session cookie policy, combined with `credentials: true` in the CORS configuration.

### Polling Inefficiencies
- **Issue**: Background requests for notifications were firing even after the user logged out.
- **Resolution**: Bound all `setInterval` logic to the `user` state within React `useEffect` hooks, ensuring intervals are cleared immediately upon logout.

---

## 12. Future Roadmap
- **Infrastructure**: Migrate to a shared root domain (e.g., `api.vsgrps.com`) to allow `SameSite: Lax` cookies for enhanced security.
- **Features**: Implement AI-driven sprint velocity predictions and automated meeting summarization.
- **Scaling**: Transition to Redis for session storage once the user base exceeds the efficient capacity of Postgres-based session handling.

---
*End of Documentation*
