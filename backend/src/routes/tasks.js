const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../db');
const { authenticateToken, requireProjectMembership } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Apply project membership middleware to all task routes
router.use(authenticateToken);
router.use(requireProjectMembership());

// 1. List tasks with server-side pagination, filters, search, and sorting
router.get('/', async (req, res) => {
  const { projectId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || '';
  const priority = req.query.priority || '';
  const assigneeId = req.query.assigneeId || '';
  const status = req.query.status || '';
  const sortBy = req.query.sortBy || 'createdAt'; // priority, dueDate, createdAt
  const sortOrder = req.query.sortOrder || 'desc'; // asc, desc

  try {
    // Construct where filter clause
    const where = { projectId };

    if (search && search.trim() !== '') {
      where.title = { contains: search };
    }

    if (priority && priority.trim() !== '') {
      where.priority = priority.toUpperCase();
    }

    if (status && status.trim() !== '') {
      where.status = status.toUpperCase();
    }

    if (assigneeId && assigneeId.trim() !== '') {
      if (assigneeId === 'unassigned') {
        where.assigneeId = null;
      } else {
        where.assigneeId = assigneeId;
      }
    }

    // Skip/Take calculation
    const skip = (page - 1) * limit;
    const take = limit;

    // Sorting definition
    let orderBy = {};
    if (sortBy === 'priority') {
      // In Prisma/SQLite, standard sort is alphabetical. We'll sort by priority field
      orderBy = { priority: sortOrder.toLowerCase() };
    } else if (sortBy === 'dueDate') {
      orderBy = { dueDate: sortOrder.toLowerCase() };
    } else {
      orderBy = { createdAt: sortOrder.toLowerCase() };
    }

    // Run parallel count and find queries
    const [totalTasks, tasks] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy,
        skip,
        take,
      }),
    ]);

    const totalPages = Math.ceil(totalTasks / limit);

    res.json({
      tasks,
      pagination: {
        totalTasks,
        totalPages,
        currentPage: page,
        limit,
      },
    });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Failed to retrieve tasks' });
  }
});

// 2. Create a new task
router.post('/', async (req, res) => {
  const { projectId } = req.params;
  const { title, description, status, priority, dueDate, assigneeId } = req.body;

  // Validation: reject empty title
  if (!title || title.trim() === '') {
    return res.status(400).json({ error: 'Task title cannot be empty.' });
  }

  // Validation: reject a due date in the past on creation
  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(dueDate);
    if (selectedDate < today) {
      return res.status(400).json({ error: 'Due date cannot be in the past.' });
    }
  }

  try {
    // Validation: reject assigning task to someone who is not a member of this project
    if (assigneeId) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_projectId: {
            userId: assigneeId,
            projectId: projectId,
          },
        },
      });
      if (!membership) {
        return res.status(400).json({ error: 'Assignee must be a member of this project.' });
      }
    }

    const taskStatus = status ? status.toUpperCase() : 'TODO';
    const taskPriority = priority ? priority.toUpperCase() : 'MEDIUM';

    // Create task
    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || '',
        status: taskStatus,
        priority: taskPriority,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedDate: taskStatus === 'DONE' ? new Date() : null,
        projectId,
        assigneeId: assigneeId || null,
        creatorId: req.user.userId,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    // Log Activity
    await logActivity(projectId, req.user.userId, 'CREATED_TASK', `Created task "${task.title}"`);

    if (assigneeId) {
      await logActivity(projectId, req.user.userId, 'ASSIGNED_TASK', `Assigned task "${task.title}" to ${task.assignee.name}`);
    }

    // Socket notification
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'task_created', task);
      if (assigneeId) {
        socketServer.sendToUser(assigneeId, 'assigned_to_me_updated', {
          action: 'assigned',
          task,
        });
      }
    }

    res.status(201).json(task);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// 3. Edit task
router.put('/:taskId', async (req, res) => {
  const { projectId, taskId } = req.params;
  const { title, description, status, priority, dueDate, assigneeId } = req.body;

  // Validation: reject empty title
  if (title !== undefined && (!title || title.trim() === '')) {
    return res.status(400).json({ error: 'Task title cannot be empty.' });
  }

  try {
    // Find current task state
    const currentTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!currentTask || currentTask.projectId !== projectId) {
      return res.status(404).json({ error: 'Task not found in this project.' });
    }

    // Role Enforcement: Only task assignee or project owner can mark Done
    if (status && status.toUpperCase() === 'DONE' && currentTask.status !== 'DONE') {
      const isAssignee = currentTask.assigneeId === req.user.userId;
      const isOwner = req.projectMembership.role === 'OWNER';
      if (!isAssignee && !isOwner) {
        return res.status(403).json({ error: 'Only the task assignee or the project owner can mark this task Done.' });
      }
    }

    // Validation: reject assignee who is not a member
    if (assigneeId && assigneeId !== currentTask.assigneeId) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_projectId: {
            userId: assigneeId,
            projectId: projectId,
          },
        },
      });
      if (!membership) {
        return res.status(400).json({ error: 'Assignee must be a member of this project.' });
      }
    }

    // Handle completedDate derivation
    let completedDateUpdate = undefined;
    if (status) {
      const newStatus = status.toUpperCase();
      if (newStatus === 'DONE' && currentTask.status !== 'DONE') {
        completedDateUpdate = new Date();
      } else if (newStatus !== 'DONE' && currentTask.status === 'DONE') {
        completedDateUpdate = null; // Clear if moved out of Done
      }
    }

    // Prepare update data
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (status !== undefined) updateData.status = status.toUpperCase();
    if (priority !== undefined) updateData.priority = priority.toUpperCase();
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (completedDateUpdate !== undefined) updateData.completedDate = completedDateUpdate;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    // Dynamic Activities logging
    if (status && status.toUpperCase() !== currentTask.status) {
      await logActivity(
        projectId,
        req.user.userId,
        'MOVED_TASK',
        `Moved task "${updatedTask.title}" from ${currentTask.status} to ${updatedTask.status}`
      );
    }

    if (assigneeId !== undefined && assigneeId !== currentTask.assigneeId) {
      const assigneeName = updatedTask.assignee ? updatedTask.assignee.name : 'Unassigned';
      await logActivity(
        projectId,
        req.user.userId,
        'ASSIGNED_TASK',
        `Assigned task "${updatedTask.title}" to ${assigneeName}`
      );
    }

    // Socket notification
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'task_updated', updatedTask);

      // Handle "Assigned to me" updates
      if (assigneeId !== undefined && assigneeId !== currentTask.assigneeId) {
        if (currentTask.assigneeId) {
          // Notify old assignee
          socketServer.sendToUser(currentTask.assigneeId, 'assigned_to_me_updated', {
            action: 'unassigned',
            task: updatedTask,
          });
        }
        if (assigneeId) {
          // Notify new assignee
          socketServer.sendToUser(assigneeId, 'assigned_to_me_updated', {
            action: 'assigned',
            task: updatedTask,
          });
        }
      } else if (updatedTask.assigneeId) {
        // If status changed or updated, notify current assignee
        socketServer.sendToUser(updatedTask.assigneeId, 'assigned_to_me_updated', {
          action: 'updated',
          task: updatedTask,
        });
      }
    }

    res.json(updatedTask);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// 4. Delete task
router.delete('/:taskId', async (req, res) => {
  const { projectId, taskId } = req.params;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: 'Task not found in this project.' });
    }

    await prisma.task.delete({
      where: { id: taskId },
    });

    // Log Activity
    await logActivity(projectId, req.user.userId, 'MOVED_TASK', `Deleted task "${task.title}"`);

    // Socket notification
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'task_deleted', { id: taskId });
      if (task.assigneeId) {
        socketServer.sendToUser(task.assigneeId, 'assigned_to_me_updated', {
          action: 'unassigned',
          task,
        });
      }
    }

    res.json({ message: 'Task deleted successfully.' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// 5. Add comment to task
router.post('/:taskId/comments', async (req, res) => {
  const { projectId, taskId } = req.params;
  const { content } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Comment content cannot be empty.' });
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        taskId,
        userId: req.user.userId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Log Activity
    await logActivity(projectId, req.user.userId, 'ADDED_COMMENT', `Commented on task "${task.title}": "${content.slice(0, 30)}..."`);

    // Socket notification
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'comment_added', { taskId, comment });
    }

    res.status(201).json(comment);
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// 6. Get comments for task
router.get('/:taskId/comments', async (req, res) => {
  const { projectId, taskId } = req.params;

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || task.projectId !== projectId) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(comments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Failed to retrieve comments' });
  }
});

module.exports = router;
