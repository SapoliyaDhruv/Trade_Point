const express = require('express');
const router = express.Router();
const { buildMulter, prepareUploads } = require('../utils/upload');
const { verifyToken } = require('../middleware/auth.middleware'); // your JWT middleware

const {
  updateProfile,
  changePassword,
  getDashboardStats,
  getDashboardAnalytics,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getRecentlyViewed,
  trackRecentlyViewed,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getWalletSummary,
  getWalletLedger,
  withdrawFromWallet
} = require('../controllers/user.controller');

const upload = buildMulter('profiles', 2 * 1024 * 1024); // 2MB max

// Routes - both require authentication
router.put('/profile', verifyToken, upload.single('profilePhoto'), prepareUploads('profiles'), updateProfile);
router.put('/change-password', verifyToken, changePassword);
router.get('/dashboard-stats', verifyToken, getDashboardStats);
router.get('/dashboard-analytics', verifyToken, getDashboardAnalytics);

router.get('/wishlist', verifyToken, getWishlist);
router.post('/wishlist/:productId', verifyToken, addToWishlist);
router.delete('/wishlist/:productId', verifyToken, removeFromWishlist);

router.get('/recently-viewed', verifyToken, getRecentlyViewed);
router.post('/recently-viewed/:productId', verifyToken, trackRecentlyViewed);

router.get('/notifications', verifyToken, getNotifications);
router.get('/notifications/unread-count', verifyToken, getUnreadNotificationCount);
router.put('/notifications/:id/read', verifyToken, markNotificationRead);
router.put('/notifications/read-all', verifyToken, markAllNotificationsRead);

router.get('/wallet', verifyToken, getWalletSummary);
router.get('/wallet/ledger', verifyToken, getWalletLedger);
router.post('/wallet/withdraw', verifyToken, withdrawFromWallet);

module.exports = router;
