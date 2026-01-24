const jwt = require('jsonwebtoken');
const { authClient } = require('../config');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Validate with Auth Service only (no local JWT verification)
    const authResult = await authClient.validateToken(token);
    
    if (!authResult.success) {
      return res.status(401).json({
        error: 'Invalid token',
        message: authResult.error
      });
    }

    // Attach user info to request
    const user = authResult.data.user;
    
    // Ensure user has required fields for downstream middleware
    if (!user) {
      return res.status(401).json({
        error: 'Invalid user data',
        message: 'User information not available'
      });
    }

    // Normalize user ID field (handle both userId and id)
    if (!user.id && user.userId) {
      user.id = user.userId;
    }
    
    if (!user.id) {
      return res.status(401).json({
        error: 'Invalid user data',
        message: 'User ID not found'
      });
    }

    // Ensure roles array exists
    if (!user.roles || !Array.isArray(user.roles)) {
      user.roles = [];
    }

    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication',
      requestId: req.id || 'unknown'
    });
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_for_validation');
    const authResult = await authClient.validateToken(token);
    
    if (authResult.success) {
      req.user = authResult.data.user;
      req.token = token;
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuthenticate
};
