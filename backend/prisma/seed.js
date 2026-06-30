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
  const surya = await prisma.user.create({
    data: {
      name: 'Suryakanta Priyadarshi',
      email: 'surya@example.com',
      password: hashedPassword,
    },
  });

  const rahul = await prisma.user.create({
    data: {
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      password: hashedPassword,
    },
  });

  const amit = await prisma.user.create({
    data: {
      name: 'Amit Patel',
      email: 'amit@example.com',
      password: hashedPassword,
    },
  });

  console.log(`Created users: ${surya.email}, ${rahul.email}, ${amit.email}`);

  // 4. Create Project
  console.log('Creating shared project...');
  const project = await prisma.project.create({
    data: {
      name: 'Build a Chat App',
      description: 'Building a simple and user-friendly chat application with real-time messages.',
    },
  });

  // 5. Create Memberships
  console.log('Adding users to project...');
  // Surya is Owner
  await prisma.membership.create({
    data: {
      userId: surya.id,
      projectId: project.id,
      role: 'OWNER',
    },
  });

  // Rahul is Member
  await prisma.membership.create({
    data: {
      userId: rahul.id,
      projectId: project.id,
      role: 'MEMBER',
    },
  });

  // Amit is Member
  await prisma.membership.create({
    data: {
      userId: amit.id,
      projectId: project.id,
      role: 'MEMBER',
    },
  });

  // 6. Create Tasks
  console.log('Creating tasks...');
  // Task 1: Done, assigned to Surya
  const task1 = await prisma.task.create({
    data: {
      title: 'Design mockup for chat screen',
      description: 'Draw some quick wireframes on Figma for how the chat window and message list should look.',
      status: 'DONE',
      priority: 'HIGH',
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      completedDate: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      projectId: project.id,
      assigneeId: surya.id,
      creatorId: surya.id,
    },
  });

  // Task 2: In Progress, assigned to Rahul
  const task2 = await prisma.task.create({
    data: {
      title: 'Setup database for users and chats',
      description: 'Create database tables for user info and save chat messages.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      projectId: project.id,
      assigneeId: rahul.id,
      creatorId: surya.id,
    },
  });

  // Task 3: Todo, assigned to Rahul
  const task3 = await prisma.task.create({
    data: {
      title: 'Build backend api for sending messages',
      description: 'Write the express backend routes to send and fetch messages.',
      status: 'TODO',
      priority: 'HIGH',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      projectId: project.id,
      assigneeId: rahul.id,
      creatorId: surya.id,
    },
  });

  // Task 4: Todo, assigned to Amit
  const task4 = await prisma.task.create({
    data: {
      title: 'Integrate socket.io for real-time messaging',
      description: 'Configure socket connections so messages show up instantly without page refresh.',
      status: 'TODO',
      priority: 'LOW',
      projectId: project.id,
      assigneeId: amit.id,
      creatorId: rahul.id,
    },
  });

  // Task 5: Todo, unassigned
  const task5 = await prisma.task.create({
    data: {
      title: 'Write unit tests for authentication',
      description: 'Write simple tests for sign up and login code.',
      status: 'TODO',
      priority: 'HIGH',
      projectId: project.id,
      creatorId: surya.id,
    },
  });

  // 7. Create Comments
  console.log('Adding task comments...');
  await prisma.comment.create({
    data: {
      content: "I drew the basic designs. Rahul, check if you like it.",
      taskId: task2.id,
      userId: surya.id,
    },
  });

  await prisma.comment.create({
    data: {
      content: 'Yes, the design looks clean! I will start setting up the database tables now.',
      taskId: task2.id,
      userId: rahul.id,
    },
  });

  // 8. Create Activity Logs
  console.log('Recording activities...');
  const logs = [
    {
      projectId: project.id,
      userId: surya.id,
      action: 'CREATED_TASK',
      details: 'Created project Build a Chat App',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'INVITED_MEMBER',
      details: 'Invited Rahul Sharma (rahul@example.com) to the project',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'INVITED_MEMBER',
      details: 'Invited Amit Patel (amit@example.com) to the project',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'CREATED_TASK',
      details: 'Created task "Design mockup for chat screen"',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'ASSIGNED_TASK',
      details: 'Assigned task "Design mockup for chat screen" to Suryakanta Priyadarshi',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'CREATED_TASK',
      details: 'Created task "Setup database for users and chats"',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'ASSIGNED_TASK',
      details: 'Assigned task "Setup database for users and chats" to Rahul Sharma',
    },
    {
      projectId: project.id,
      userId: surya.id,
      action: 'ADDED_COMMENT',
      details: 'Commented on task "Setup database for users and chats": "I drew..."',
    },
    {
      projectId: project.id,
      userId: rahul.id,
      action: 'ADDED_COMMENT',
      details: 'Commented on task "Setup database for users and chats": "Yes, the design..."',
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
