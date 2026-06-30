# TaskFlow - Collaborative Real-Time Task Board

TaskFlow is a collaborative task board application (like Trello or Jira) where team members can manage tasks together in real-time. 

When a user creates a task, updates it, or adds a comment, everyone on the same project sees the updates instantly without refreshing the page.

---

## 🚀 How to Run the App

Follow these simple steps to run the application on your computer:

### Step 1: Install Dependencies
Open your terminal in the project root folder and run:
```bash
npm run install:all
```
*(This will install all necessary packages for both the backend and frontend).*

### Step 2: Set Up Environment Variables
Create a file named `.env` in the `backend` folder and add your database URL:
```env
DATABASE_URL="your-postgresql-database-connection-url"
```
*   **Database Option (Online/Local):** You can use a local PostgreSQL database or an online serverless database (like **Neon.tech**, which was used during development for zero-config database hosting).
*   **JWT Secrets (Optional Fallback):** You can also add `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to this file. If you leave them out, the application automatically uses built-in default secrets so it runs immediately without errors!

### Step 3: Run Database Migrations
Run this command to create the database tables:
```bash
# In the backend directory
npx prisma migrate dev --name init
```

### Step 4: Seed the Database
Populate the database with test projects and users:
```bash
# In the backend directory
npm run seed
```

### Step 5: Start the App
Run this command in the project root directory to start both the frontend and backend:
```bash
npm run dev
```
*   **Frontend Client:** Open `http://localhost:5173` in your browser.
*   **Backend Server:** Runs on `http://localhost:5000`.

---

## 💾 Database Details

*   **Database Engine:** PostgreSQL (a highly reliable, production-ready relational database).
*   **Hosting:** Hosted online using **Neon.tech** (a serverless PostgreSQL platform).
*   **How the tables were built:** The database tables and schemas were created using **Prisma ORM**. When you run the `npx prisma migrate dev` command, Prisma reads the `schema.prisma` file and automatically builds the tables (User, Membership, Project, Task, Comment, etc.) inside the PostgreSQL database.

---

## 🔑 Pre-Seeded Test Data & Credentials

To let you test collaboration and real-time features instantly, the seed script (`npm run seed`) automatically populates the database with:

1.  **Three Test Users** (use password **`Password123`** for all of them):
    *   **Suryakanta Priyadarshi (Project Owner):** `surya@example.com`
    *   **Rahul Sharma (Project Member):** `rahul@example.com`
    *   **Amit Patel (Project Member):** `amit@example.com`
2.  **A Shared Project:** A project named **"Build a Chat App"** is automatically created, with all three users added as members (Surya is the Owner, while Rahul and Amit are Members).
3.  **Pre-configured Tasks:** Several tasks are already added to the board in different states (To Do, In Progress, Done) and assigned across users so you can see live metrics and test drag-and-drop actions immediately.

---

## 🎮 Features to Try Out

1.  **Real-Time Sync:** Log in with `surya@example.com` in a normal browser window, and log in with `rahul@example.com` in an incognito window. Open the same project on both screens and drag tasks around—they will update instantly on both screens!
2.  **Role-Based Rules:** Project members (like Rahul) cannot move tasks to **Done** unless they are assigned to that task. Project Owners (like Surya) can move any task.
3.  **Automatic Due Date Check:** You cannot create a task with a due date in the past.
4.  **Activity Feed:** Keep track of who moved which task and when.
