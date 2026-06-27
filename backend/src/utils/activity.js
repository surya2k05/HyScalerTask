const prisma = require('../db');

async function logActivity(projectId, userId, action, details) {
  try {
    const log = await prisma.activityLog.create({
      data: {
        projectId,
        userId,
        action,
        details,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    // Notify websocket server (we will export the emitter dynamically from our sockets setup)
    const socketServer = require('../sockets/socket');
    if (socketServer && typeof socketServer.broadcastToProject === 'function') {
      socketServer.broadcastToProject(projectId, 'activity_logged', log);
    }

    return log;
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

module.exports = { logActivity };
