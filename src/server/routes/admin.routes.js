const express = require('express');
const router = express.Router();

const { 
  getAllUsers, 
  updateUserRole,
  getDashboardOverview,
  getRiskFlags,
  getCommissionSettings,
  updateDefaultCommission,
  updateCategoryCommission,
  broadcastNotification,
  getAnalytics,
  getAuditLogAdmins,
  getAuditLogs,
  getEarningsReportUsers,
  getEarningsReport,
  exportEarningsReportCsv,
  getModerationOverview,
  updateModerationKeywords,
  getPendingTransactions,
  approveTransaction,
  rejectTransaction,
  getAdminChatMessages,
  sendAdminChatMessage
} = require('../controllers/admin.controller');

const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.get('/users', verifyToken, isAdmin, getAllUsers);
router.put('/users/:id/role', verifyToken, isAdmin, updateUserRole);
router.get('/dashboard-overview', verifyToken, isAdmin, getDashboardOverview);
router.get('/risk-flags', verifyToken, isAdmin, getRiskFlags);
router.get('/commission', verifyToken, isAdmin, getCommissionSettings);
router.put('/commission/default', verifyToken, isAdmin, updateDefaultCommission);
router.put('/commission/category/:categoryId', verifyToken, isAdmin, updateCategoryCommission);
router.post('/notifications/broadcast', verifyToken, isAdmin, broadcastNotification);
router.get('/analytics', verifyToken, isAdmin, getAnalytics);
router.get('/audit-logs/admins', verifyToken, isAdmin, getAuditLogAdmins);
router.get('/audit-logs', verifyToken, isAdmin, getAuditLogs);
router.get('/reports/users', verifyToken, isAdmin, getEarningsReportUsers);
router.get('/reports/earnings', verifyToken, isAdmin, getEarningsReport);
router.get('/reports/earnings/export', verifyToken, isAdmin, exportEarningsReportCsv);
router.get('/moderation', verifyToken, isAdmin, getModerationOverview);
router.put('/moderation/keywords', verifyToken, isAdmin, updateModerationKeywords);

// Transaction management routes (new)
router.get('/transactions/pending', verifyToken, isAdmin, getPendingTransactions);
router.put('/transactions/:transactionId/approve', verifyToken, isAdmin, approveTransaction);
router.put('/transactions/:transactionId/reject', verifyToken, isAdmin, rejectTransaction);

// Admin chat (admin-only)
router.get('/chat/messages', verifyToken, isAdmin, getAdminChatMessages);
router.post('/chat/messages', verifyToken, isAdmin, sendAdminChatMessage);

module.exports = router;
