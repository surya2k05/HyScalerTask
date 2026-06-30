const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { JWT_ACCESS_SECRET } = require('../utils/auth');
const prisma = require('../db');

let io = null;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*', // In production, restrict to frontend origin
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  // Socket.io Middleware for JWT authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
      socket.user = decoded; // Attach user details to socket
      next();
    } catch (err) {
      return next(new Error('Authentication error: Token invalid or expired'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    console.log(`Socket connected: User ${userId} (${socket.user.name})`);

    // 1. Join user's personal room for individual live updates (e.g. "Assigned to me")
    socket.join(userId);

    // 2. Join a project room
    socket.on('join_project', async ({ projectId }) => {
      if (!projectId) return;

      try {
        let membership = null;
        let retries = 3;
        while (retries > 0) {
          try {
            membership = await prisma.membership.findUnique({
              where: {
                userId_projectId: {
                  userId: userId,
                  projectId: projectId,
                },
              },
            });
            break; // Success, break retry loop
          } catch (dbErr) {
            retries--;
            console.error(`Socket DB check failed (retries remaining: ${retries}):`, dbErr.message);
            if (retries === 0) throw dbErr;
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          }
        }

        if (membership) {
          socket.join(projectId);
          console.log(`User ${userId} joined project room: ${projectId}`);
          socket.emit('joined_project', { projectId, message: 'Successfully joined room' });
        } else {
          socket.emit('error_message', { message: 'Access denied: You are not a member of this project' });
        }
      } catch (err) {
        console.error('Socket join_project error:', err);
      }
    });

    // 3. Leave a project room
    socket.on('leave_project', ({ projectId }) => {
      if (!projectId) return;
      socket.leave(projectId);
      console.log(`User ${userId} left project room: ${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: User ${userId}`);
    });
  });

  return io;
}

// Helper to broadcast to a project room
function broadcastToProject(projectId, event, data) {
  if (io) {
    io.to(projectId).emit(event, data);
  }
}

// Helper to send to a specific user
function sendToUser(userId, event, data) {
  if (io) {
    io.to(userId).emit(event, data);
  }
}

module.exports = {
  initializeSocket,
  broadcastToProject,
  sendToUser,
};
