# TaskFlow | Collaborative Real-Time Task Board

TaskFlow is a premium, high-fidelity real-time collaborative task board application (similar to Trello/Jira). It enables teams to create projects, invite members, establish roles, and manage tasks across status columns (To Do, In Progress, Done) with drag-and-drop mechanics. It synchronizes changes immediately across all team members' boards using secure WebSockets and features a server-side paginated & sorted backlog table, comments feed, project log tracking, and a comprehensive user dashboard.

---

## Technical Stack & Architecture Rationale

### 1. Frontend
*   **React (Vite):** Chosen for its rapid execution speed, lightweight bundle size, and native virtual DOM rendering. 
*   **Vanilla CSS:** Built with a custom glassmorphic design system to create a premium, modern user interface without adding compilation latency or relying on external UI libraries.
*   **Socket.io-client:** Utilized for real-time WebSocket messaging and automated reconnection handshakes.

### 2. Backend
*   **Node.js & Express:** Lightweight, asynchronous backend runtime environment suitable for heavy I/O operations and event-driven WebSocket architectures.
*   **Socket.io:** Powers WebSocket communication with namespaces, handshakes, and rooms.

### 3. Database & ORM
*   **Prisma ORM:** Provides type-safe queries, auto-generated migrations, and robust relationship handling.
*   **PostgreSQL:** Selected as the primary relational database to satisfy strict multi-user concurrency and transactional operations. 
*   **Neon.tech (Cloud PostgreSQL):** Configured as the recommended serverless cloud hosting platform to ensure a credit-card-free, 10-second database setup experience.

---

## How to Run the App (Clean-Clone Verified)

Ensure you have **Node.js (v18+)** installed.

### Step 1: Clone and Install Dependencies
In the root directory of the project, run:
```bash
npm run install:all
```
*This command automatically runs `npm install` in the root, the `backend` folder, and the `frontend` folder.*

### Step 2: Configure Environment Variables
1. Sign up/log in at [Neon.tech](https://neon.tech/) and create a free project.
2. Copy your PostgreSQL connection string.
3. Open `backend/.env` and paste it as the `DATABASE_URL`:
   ```env
   DATABASE_URL="postgresql://neondb_owner:password@ep-cool-wave-12345.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```

### Step 3: Run Database Migrations
Deploy the tables directly into your PostgreSQL database:
```bash
# From the backend directory
npx prisma migrate dev --name init
```

### Step 4: Seed Mock Data
Populate the database with pre-configured team users and tasks:
```bash
npm run seed
```
*The database is populated with three default users:*
*   **Alice Smith:** `alice@example.com` (Password: `Password123`) - *Project Owner*
*   **Bob Johnson:** `bob@example.com` (Password: `Password123`) - *Project Member*
*   **Charlie Brown:** `charlie@example.com` (Password: `Password123`) - *Project Member*

### Step 5: Run the Application Concurrently
In the root directory, start the Express server and Vite development environment in a single terminal:
```bash
npm run dev
```
*   **Backend Server:** Runs on `http://localhost:5000`
*   **Frontend Client:** Runs on `http://localhost:5173` (Open this in your browser)

---

## Data Model & Relationships

The relational database schema is managed via Prisma. Here is the entity structure and how they map:

```mermaid
erDiagram
    User ||--o{ Membership : has
    User ||--o{ Task : assigned
    User ||--o{ Comment : writes
    User ||--o{ RefreshToken : owns
    User ||--o{ ActivityLog : performs
    
    Project ||--o{ Membership : contains
    Project ||--o{ Task : contains
    Project ||--o{ ActivityLog : records

    Task ||--o{ Comment : has
    
    Membership {
        string id PK
        string userId FK
        string projectId FK
        string role "OWNER | MEMBER"
        datetime createdAt
    }
    
    Task {
        string id PK
        string title
        string description
        string status "TODO | IN_PROGRESS | DONE"
        string priority "LOW | MEDIUM | HIGH"
        datetime dueDate
        datetime completedDate
        string projectId FK
        string assigneeId FK
        string creatorId FK
    }

    Comment {
        string id PK
        string content
        string taskId FK
        string userId FK
        datetime createdAt
    }
```

### Key Constraints:
1.  **Many-to-Many Relationships:** Users relate to Projects via an explicit `Membership` join table. This stores the metadata representing their specific role (`OWNER` or `MEMBER`).
2.  **Cascade Actions:** 
    *   Deleting a `Project` cascades deletions to its `Tasks`, `Memberships`, and `ActivityLogs`.
    *   Removing a `Member` from a project cascades their `Membership` deletion. Crucially, tasks they created are preserved (since they relate to `creatorId`), but any active task where they are `assigneeId` is set to `NULL` (auto-unassigned) to prevent orphaned assignments.

---

## Core Security & Architecture Implementation

### 1. Authentication & Refresh Token Flow
*   **Access Token:** Short-lived JWT (15-minute expiry) containing user context (`userId`, `name`, `email`). It is passed in the header as a `Bearer` token and stored in memory on the client side.
*   **Refresh Token:** Long-lived JWT (7-day expiry) containing `userId`. It is returned inside the response body and stored in `localStorage` by the client, while a hashed reference is stored in the `RefreshToken` database table.
*   **Expired Access Token Refreshes (Transparently):**
    *   The frontend custom client (`api.js`) wraps native `fetch`.
    *   If a request yields a `401 Unauthorized` with code `TOKEN_EXPIRED`, the request queue is paused.
    *   An API handshake `/api/auth/refresh` is triggered.
    *   If the database verifies the refresh token, a new access token and a new rotated refresh token are issued (Refresh Token Rotation).
    *   The client stores the new tokens and retries the original request, resulting in a zero-disruption user experience.

### 2. WebSocket Security & Event Scoping (Socket.io)
*   **Authenticated Connection Handshake:** Socket.io connections are intercepted by a backend middleware verifying the JWT access token. Unauthenticated sockets are rejected.
*   **Membership-Scoped Channels (Rooms):**
    *   Upon connecting, the socket joins a private room mapped to the user's ID (`socket.join(userId)`). This routes personal live alerts (like "Assigned to me" status shifts) directly to that user.
    *   When viewing a board, the client sends a `join_project` socket event. The backend queries the database to verify membership. If the user belongs to the project, the socket joins the project-specific room (`socket.join(projectId)`).
    *   All board updates (moves, edits, comments) are emitted only to that `projectId` room. This ensures no global broadcasts occur, and data never leaks to non-members.
*   **Disconnects & Resilience:** If the socket drops, the client automatically attempts reconnection. The client application remains fully interactive: operations fallback to standard HTTP API endpoints, and a manual page refresh will fetch the current backend state.

### 3. Role-Based Validation & Business Rules
*   **Status Changes to 'Done':** Only the task assignee or the project OWNER is authorized to mark a task as Done. The backend enforces this check; unauthorized attempts yield a `403 Forbidden` response. On the Kanban board, if an unauthorized user attempts to drag a card to "Done", the frontend catches the failure, displays a toast alert, and rolls back the task position to its original column.
*   **Completed Date:** Automatically records the current timestamp when a task status changes to `DONE`. If it is dragged back to `IN_PROGRESS` or `TODO`, the timestamp is cleared.
*   **Due Date in the Past:** Validated on task creation to reject past dates.

---

## Server-Side Pagination & Sorting (Requirement 14)
To ensure performance on large datasets, the **Backlog view** implements database-level sorting and pagination:
*   The client sends parameters: `page`, `limit`, `search` (title search), `priority`, `assigneeId`, `sortBy` (`createdAt`, `dueDate`, `priority`), and `sortOrder` (`asc`, `desc`).
*   The backend performs a count query alongside a paginated query using Prisma's `skip` and `take` operators.

---

## Known Limitations & Future Improvements
1.  **Websocket Scale:** For large-scale multi-server deployments, we would integrate a Redis Adapter into Socket.io to share room states across multiple backend nodes.
2.  **Drag and Drop Animations:** While HTML5 Drag and Drop provides solid, reliable card moving mechanics, adding micro-spring animations (e.g. Framer Motion) would enhance the fluid feel.

---

## AI Implementation & Attributions
*   **Where AI was used:** Assisted in bootstrapping boilerplate configurations for Vite, structural schema designs, and composing the initial SVG icons layout.
*   **What was learned:** Refinements in handling the new Prisma 7 configuration features compared to standard Prisma 5, and optimal state sync patterns between Socket.io listeners and React state queues.
