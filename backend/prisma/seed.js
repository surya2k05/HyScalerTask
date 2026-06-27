const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // 1. Clear database
  await prisma.refreshToken.deleteMany({});
  await prisma.activityLog.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('Database cleared.');

  // 2. Hash passwords
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Password123', salt);

  // 3. Create users
  console.log('Creating users...');
  const alice = await prisma.user.create({
    data: {
      name: 'Alice Smith',
      email: 'alice@example.com',
      password: hashedPassword,
    },
  });

  const bob = await prisma.user.create({
    data: {
      name: 'Bob Johnson',
      email: 'bob@example.com',
      password: hashedPassword,
    },
  });

  const charlie = await prisma.user.create({
    data: {
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      password: hashedPassword,
    },
  });

  console.log(`Created users: ${alice.email}, ${bob.email}, ${charlie.email}`);

  // 4. Create Project
  console.log('Creating shared project...');
  const project = await prisma.project.create({
    data: {
      name: 'Acme Website Replatform',
      description: 'Migrating legacy client frontend and backend architectures to a modern stack.',
    },
  });

  // 5. Create Memberships
  console.log('Adding users to project...');
  // Alice is Owner
  await prisma.membership.create({
    data: {
      userId: alice.id,
      projectId: project.id,
      role: 'OWNER',
    },
  });

  // Bob is Member
  await prisma.membership.create({
    data: {
      userId: bob.id,
      projectId: project.id,
      role: 'MEMBER',
    },
  });

  // Charlie is Member
  await prisma.membership.create({
    data: {
      userId: charlie.id,
      projectId: project.id,
      role: 'MEMBER',
    },
  });

  // 6. Create Tasks
  console.log('Creating tasks...');
  // Task 1: Done, assigned to Alice
  const task1 = await prisma.task.create({
    data: {
      title: 'Design landing page wireframes',
      description: 'Draft the layout for desktop and mobile screen resolutions.',
      status: 'DONE',
      priority: 'HIGH',
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      completedDate: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      projectId: project.id,
      assigneeId: alice.id,
      creatorId: alice.id,
    },
  });

  // Task 2: In Progress, assigned to Bob
  const task2 = await prisma.task.create({
    data: {
      title: 'Setup database schema and migrations',
      description: 'Initialize Prisma ORM models and verify SQLite database files locally.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      projectId: project.id,
      assigneeId: bob.id,
      creatorId: alice.id,
    },
  });

  // Task 3: Todo, assigned to Bob
  const task3 = await prisma.task.create({
    data: {
      title: 'Implement JWT refresh token rotation',
      description: 'Write auth endpoints to handle short-lived access tokens and token rotating refresh endpoints.',
      status: 'TODO',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      projectId: project.id,
      assigneeId: bob.id,
      creatorId: alice.id,
    },
  });

  // Task 4: Todo, assigned to Charlie
  const task4 = await prisma.task.create({
    data: {
      title: 'Write frontend integration tests',
      description: 'Set up testing library to mock HTTP calls and simulate user routing flows.',
      status: 'TODO',
      priority: 'LOW',
      projectId: project.id,
      assigneeId: charlie.id,
      creatorId: bob.id,
    },
  });

  // Task 5: Todo, unassigned
  const task5 = await prisma.task.create({
    data: {
      title: 'Deploy application to server',
      description: 'Set up Docker configuration for deployment pipelines.',
      status: 'TODO',
      priority: 'HIGH',
      projectId: project.id,
      creatorId: alice.id,
    },
  });

  // 7. Create Comments
  console.log('Adding task comments...');
  await prisma.comment.create({
    data: {
      content: "I've initialized the Prisma models. Bob, please verify the migrations.",
      taskId: task2.id,
      userId: alice.id,
    },
  });

  await prisma.comment.create({
    data: {
      content: 'Understood. I ran the migration command and it generated successfully. I am starting to write the database exporter module now.',
      taskId: task2.id,
      userId: bob.id,
    },
  });

  // 8. Create Activity Logs
  console.log('Recording activities...');
  const logs = [
    {
      projectId: project.id,
      userId: alice.id,
      action: 'CREATED_TASK',
      details: 'Created project Acme Website Replatform',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'INVITED_MEMBER',
      details: 'Invited Bob Johnson (bob@example.com) to the project',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'INVITED_MEMBER',
      details: 'Invited Charlie Brown (charlie@example.com) to the project',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'CREATED_TASK',
      details: 'Created task "Design landing page wireframes"',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'ASSIGNED_TASK',
      details: 'Assigned task "Design landing page wireframes" to Alice Smith',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'CREATED_TASK',
      details: 'Created task "Setup database schema and migrations"',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'ASSIGNED_TASK',
      details: 'Assigned task "Setup database schema and migrations" to Bob Johnson',
    },
    {
      projectId: project.id,
      userId: alice.id,
      action: 'ADDED_COMMENT',
      details: 'Commented on task "Setup database schema and migrations": "I\'ve initialized..."',
    },
    {
      projectId: project.id,
      userId: bob.id,
      action: 'ADDED_COMMENT',
      details: 'Commented on task "Setup database schema and migrations": "Understood. I ran..."',
    },
  ];

  for (const log of logs) {
    await prisma.activityLog.create({
      data: log,
    });
  }

  console.log('Database seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
