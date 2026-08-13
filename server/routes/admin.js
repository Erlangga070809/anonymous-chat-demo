const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.use(authenticate, requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/users', adminController.getUsers);
router.get('/reports', adminController.getReports);
router.patch('/reports/:id', adminController.updateReportStatus);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);
router.post('/users/:id/suspend', adminController.suspendUser);
router.get('/rooms', adminController.getActiveRooms);
router.get('/queue', adminController.getMatchmakingQueue);
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
