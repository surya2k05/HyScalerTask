const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // 1. Number of projects the user is in
    const projectsCount = await prisma.membership.count({
      where: { userId },
    });

    // 2. Tasks assigned to the user by status
    const assignedTasks = await prisma.task.findMany({
      where: { assigneeId: userId },
    });

    const tasksByStatus = {
      todo: assignedTasks.filter((t) => t.status === 'TODO').length,
      inProgress: assignedTasks.filter((t) => t.status === 'IN_PROGRESS').length,
      done: assignedTasks.filter((t) => t.status === 'DONE').length,
    };

    // 3. Tasks they completed this week
    const today = new Date();
    // Get Sunday of the current week
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const completedThisWeek = await prisma.task.count({
      where: {
        assigneeId: userId,
        status: 'DONE',
        completedDate: {
          gte: startOfWeek,
        },
      },
    });

    // 4. The project with the most open tasks (status not Done)
    const userMemberships = await prisma.membership.findMany({
      where: { userId },
      select: {
        projectId: true,
        project: { select: { name: true } },
      },
    });

    const projectOpenTasks = await Promise.all(
      userMemberships.map(async (m) => {
        const count = await prisma.task.count({
          where: {
            projectId: m.projectId,
            status: { not: 'DONE' },
          },
        });
        return {
          id: m.projectId,
          name: m.project.name,
          openTasksCount: count,
        };
      })
    );

    projectOpenTasks.sort((a, b) => b.openTasksCount - a.openTasksCount);
    const projectWithMostOpenTasks = projectOpenTasks.length > 0 ? projectOpenTasks[0] : null;

    // 5. Personal recent-activity feed (reverse-chronological events from projects they are members of)
    const projectIds = userMemberships.map((m) => m.projectId);
    const recentActivity = await prisma.activityLog.findMany({
      where: {
        projectId: { in: projectIds },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 15, // Get top 15 events
    });

    // Also get the list of "Assigned to me" tasks across all projects
    const assignedTasksDetails = await prisma.task.findMany({
      where: {
        assigneeId: userId,
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      projectsCount,
      tasksByStatus,
      completedThisWeek,
      projectWithMostOpenTasks,
      recentActivity,
      assignedTasks: assignedTasksDetails,
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard statistics' });
  }
});

module.exports = router;
