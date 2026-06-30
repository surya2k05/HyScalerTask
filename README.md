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

## 🔑 Test Login Credentials

The database is pre-seeded with these three users (use password **`Password123`** for all of them):

1.  **Suryakanta Priyadarshi (Owner):** `surya@example.com`
2.  **Rahul Sharma (Member):** `rahul@example.com`
3.  **Amit Patel (Member):** `amit@example.com`

---

## 🎮 Features to Try Out

1.  **Real-Time Sync:** Log in with `surya@example.com` in a normal browser window, and log in with `rahul@example.com` in an incognito window. Open the same project on both screens and drag tasks around—they will update instantly on both screens!
2.  **Role-Based Rules:** Project members (like Rahul) cannot move tasks to **Done** unless they are assigned to that task. Project Owners (like Surya) can move any task.
3.  **Automatic Due Date Check:** You cannot create a task with a due date in the past.
4.  **Activity Feed:** Keep track of who moved which task and when.
