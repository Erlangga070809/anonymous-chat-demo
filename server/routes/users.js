const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, userController.getMe);
router.patch('/me', authenticate, userController.updateMe);
router.delete('/me', authenticate, userController.deleteAccount);
router.get('/blocked', authenticate, userController.getBlockedUsers);
router.post('/block', authenticate, userController.blockUser);
router.delete('/block/:id', authenticate, userController.unblockUser);

module.exports = router;
