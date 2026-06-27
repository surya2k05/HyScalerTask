const jwt = require('jsonwebtoken');
const { JWT_ACCESS_SECRET } = require('../utils/auth');
const prisma = require('../db');

// Middleware to authenticate requests using JWT access token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required', code: 'TOKEN_MISSING' });
  }

  try {
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid access token', code: 'TOKEN_INVALID' });
  }
}

// Middleware to enforce project membership and roles
function requireProjectMembership(requiredRole = null) {
  return async (req, res, next) => {
    const projectId = req.params.projectId || req.body.projectId || req.query.projectId || req.params.id;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    try {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_projectId: {
            userId: req.user.userId,
            projectId: projectId,
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Access denied: You are not a member of this project' });
      }

      if (requiredRole && membership.role !== requiredRole) {
        return res.status(403).json({ error: `Access denied: Requires ${requiredRole} role` });
      }

      // Attach membership info to request for downstream handlers
      req.projectMembership = membership;
      next();
    } catch (err) {
      console.error('Error checking project membership:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  authenticateToken,
  requireProjectMembership,
};
