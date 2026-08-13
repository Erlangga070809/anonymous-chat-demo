const { query } = require('../db');
const { sanitizeInput } = require('../utils/validator');

const getMe = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, anonymous_id, role, status, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
};

const updateMe = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }
    
    const cleanEmail = sanitizeInput(email.toLowerCase());
    
    const result = await query(
      `UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, anonymous_id, role, status`,
      [cleanEmail, req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Email already in use'
      });
    }
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

const getBlockedUsers = async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.anonymous_id, b.created_at as blocked_at
       FROM blocks b
       JOIN users u ON b.blocked_id = u.id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        blockedUsers: result.rows
      }
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blocked users'
    });
  }
};

const blockUser = async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId || userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user to block'
      });
    }
    
    const targetUser = await query('SELECT id FROM users WHERE id = $1', [userId]);
    
    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    await query(
      `INSERT INTO blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [req.user.id, userId]
    );
    
    await query(
      `UPDATE chat_rooms SET status = 'blocked', closed_at = CURRENT_TIMESTAMP
       WHERE id IN (
         SELECT room_id FROM room_members
         WHERE user_id = $1
       )
       AND id IN (
         SELECT room_id FROM room_members
         WHERE user_id = $2
       )
       AND status = 'active'`,
      [req.user.id, userId]
    );
    
    await query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1 OR user_id = $2',
      [req.user.id, userId]
    );
    
    res.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user'
    });
  }
};

const unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [req.user.id, id]
    );
    
    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    });
  }
};

const deleteAccount = async (req, res) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.user.id]);
    
    res.clearCookie(config.cookieName);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
};

module.exports = {
  getMe,
  updateMe,
  getBlockedUsers,
  blockUser,
  unblockUser,
  deleteAccount
};
