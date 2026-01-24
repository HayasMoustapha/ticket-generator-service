const { authClient } = require('../config');

const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
      }

      // Defensive check for user ID
      if (!req.user.id) {
        return res.status(401).json({
          error: 'Invalid user data',
          message: 'User ID not found in request'
        });
      }

      const permissionResult = await authClient.checkPermission(req.user.id, permission);
      
      if (!permissionResult.success) {
        return res.status(403).json({
          error: 'Permission denied',
          message: 'Unable to verify permissions',
          details: permissionResult.error
        });
      }

      if (!permissionResult.data.has_permission && !permissionResult.allowed) {
        return res.status(403).json({
          error: 'Permission denied',
          message: `Required permission: ${permission}`
        });
      }

      req.userPermissions = permissionResult.data.permissions || [];
      next();
    } catch (error) {
      console.error('RBAC error:', error);
      return res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during authorization',
        requestId: req.id || 'unknown'
      });
    }
  };
};

const requirePermissions = (permissions, mode = 'all') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
      }

      const permissionChecks = await Promise.all(
        permissions.map(permission => 
          authClient.checkPermission(req.user.id, permission)
        )
      );

      const hasPermissions = permissionChecks.map(check => 
        check.success && check.data.has_permission
      );

      let authorized;
      if (mode === 'any') {
        authorized = hasPermissions.some(Boolean);
      } else {
        authorized = hasPermissions.every(Boolean);
      }

      if (!authorized) {
        return res.status(403).json({
          error: 'Permission denied',
          message: `Required permissions: ${permissions.join(', ')} (mode: ${mode})`
        });
      }

      req.userPermissions = permissionChecks
        .filter(check => check.success)
        .flatMap(check => check.data.permissions || []);
      
      next();
    } catch (error) {
      console.error('RBAC error:', error);
      return res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during authorization'
      });
    }
  };
};

const requireRole = (role) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User not authenticated'
        });
      }

      // Defensive check for roles array
      if (!req.user.roles || !Array.isArray(req.user.roles)) {
        return res.status(403).json({
          error: 'Role required',
          message: 'User roles not defined',
          requiredRole: role
        });
      }

      const hasRole = req.user.roles.includes(role);
      
      if (!hasRole) {
        return res.status(403).json({
          error: 'Role required',
          message: `Required role: ${role}`,
          userRoles: req.user.roles
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during role verification',
        requestId: req.id || 'unknown'
      });
    }
  };
};

const requireAdmin = requireRole('admin');
const requireSuperAdmin = requireRole('super_admin');

module.exports = {
  requirePermission,
  requirePermissions,
  requireRole,
  requireAdmin,
  requireSuperAdmin
};
