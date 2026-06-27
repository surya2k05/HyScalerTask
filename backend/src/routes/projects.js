const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticateToken, requireProjectMembership } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Apply auth token validation to all project routes
router.use(authenticateToken);

// 1. List all projects the user is a member of
router.get('/', async (req, res) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user.userId },
      include: {
        project: {
          include: {
            memberships: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const projects = memberships.map((m) => ({
      id: m.project.id,
      name: m.project.name,
      description: m.project.description,
      role: m.role,
      createdAt: m.project.createdAt,
      members: m.project.memberships.map((mem) => ({
        id: mem.user.id,
        name: mem.user.name,
        email: mem.user.email,
        role: mem.role,
      })),
    }));

    res.json(projects);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to retrieve projects' });
  }
});

// 2. Create a new project
router.post('/', async (req, res) => {
  const { name, description } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Project name is required.' });
  }

  try {
    // Start transaction to create project and owner membership
    const project = await prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          name: name.trim(),
          description: description?.trim() || '',
        },
      });

      await tx.membership.create({
        data: {
          userId: req.user.userId,
          projectId: proj.id,
          role: 'OWNER',
        },
      });

      return proj;
    });

    // Log project creation activity
    await logActivity(project.id, req.user.userId, 'INVITED_MEMBER', `Project creator is designated as OWNER`);

    res.status(201).json({
      message: 'Project created successfully',
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        role: 'OWNER',
      },
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// 3. Get specific project details
router.get('/:projectId', requireProjectMembership(), async (req, res) => {
  const { projectId } = req.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const payload = {
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt,
      role: req.projectMembership.role,
      members: project.memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
      tasks: project.tasks,
    };

    res.json(payload);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to retrieve project details.' });
  }
});

// 4. Delete project (OWNER only)
router.delete('/:projectId', requireProjectMembership('OWNER'), async (req, res) => {
  const { projectId } = req.params;

  try {
    await prisma.project.delete({
      where: { id: projectId },
    });

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// 5. Invite member to project (OWNER only)
router.post('/:projectId/invite', requireProjectMembership('OWNER'), async (req, res) => {
  const { projectId } = req.params;
  const { email } = req.body;

  if (!email || email.trim() === '') {
    return res.status(400).json({ error: 'User email is required to invite.' });
  }

  try {
    // Find registered user by email
    const userToInvite = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!userToInvite) {
      return res.status(404).json({ error: 'User not found. They must register first.' });
    }

    // Check if user is already a member
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_projectId: {
          userId: userToInvite.id,
          projectId: projectId,
        },
      },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'User is already a member of this project.' });
    }

    // Create membership
    const membership = await prisma.membership.create({
      data: {
        userId: userToInvite.id,
        projectId: projectId,
        role: 'MEMBER',
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Log membership activity
    await logActivity(projectId, req.user.userId, 'INVITED_MEMBER', `Invited ${userToInvite.name} (${userToInvite.email}) to the project`);

    // Dynamic broadcast for UI live updates
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'project_updated', {
        action: 'member_added',
        member: {
          id: userToInvite.id,
          name: userToInvite.name,
          email: userToInvite.email,
          role: 'MEMBER',
        },
      });
      // Also notify the invited user so their dashboard list updates
      socketServer.sendToUser(userToInvite.id, 'invited_to_project', { projectId });
    }

    res.status(201).json({
      message: 'User invited successfully',
      member: {
        id: userToInvite.id,
        name: userToInvite.name,
        email: userToInvite.email,
        role: membership.role,
      },
    });
  } catch (err) {
    console.error('Invite member error:', err);
    res.status(500).json({ error: 'Failed to invite user.' });
  }
});

// 6. Remove member from project (OWNER only)
router.post('/:projectId/remove', requireProjectMembership('OWNER'), async (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required to remove.' });
  }

  // Prevent owner removing themselves (must delete project or transfer owner)
  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'Owners cannot remove themselves from their project. You can delete the project instead.' });
  }

  try {
    const membership = await prisma.membership.findUnique({
      where: {
        userId_projectId: {
          userId: userId,
          projectId: projectId,
        },
      },
      include: { user: true },
    });

    if (!membership) {
      return res.status(404).json({ error: 'User is not a member of this project.' });
    }

    // Auto-unassign tasks assigned to this user in this project
    await prisma.task.updateMany({
      where: {
        projectId: projectId,
        assigneeId: userId,
      },
      data: {
        assigneeId: null,
      },
    });

    // Delete membership
    await prisma.membership.delete({
      where: {
        userId_projectId: {
          userId: userId,
          projectId: projectId,
        },
      },
    });

    // Log activity
    await logActivity(projectId, req.user.userId, 'REMOVED_MEMBER', `Removed member ${membership.user.name} (${membership.user.email})`);

    // Dynamic broadcast for UI live updates
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'project_updated', {
        action: 'member_removed',
        userId: userId,
      });
      // Notify the removed user
      socketServer.sendToUser(userId, 'removed_from_project', { projectId });
    }

    res.json({ message: 'Member removed successfully and all their assigned tasks unassigned.' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member.' });
  }
});

// 7. Get Activity Feed (Reverse-chronological)
router.get('/:projectId/activity', requireProjectMembership(), async (req, res) => {
  const { projectId } = req.params;

  try {
    const logs = await prisma.activityLog.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Get last 50 events
    });

    res.json(logs);
  } catch (err) {
    console.error('Get activity error:', err);
    res.status(500).json({ error: 'Failed to retrieve activity feed' });
  }
});

module.exports = router;
