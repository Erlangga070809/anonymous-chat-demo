const { query } = require('../db');
const { validateEmail } = require('../utils/validator');

const getStats = async (req, res) => {
  try {
    const statsResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE status = 'active') as active_users,
        (SELECT COUNT(*) FROM users WHERE status = 'banned') as banned_users,
        (SELECT COUNT(*) FROM users WHERE status = 'suspended') as suspended_users,
        (SELECT COUNT(*) FROM chat_rooms WHERE status = 'active') as active_rooms,
        (SELECT COUNT(*) FROM matchmaking_queue) as queued_users,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
        (SELECT COUNT(*) FROM messages WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as messages_24h
    `);
    
    res.json({
      success: true,
      data: {
        stats: statsResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
};

const getUsers = async (req, res) => {
  try {
    const { search, status } = req.query;
    let usersQuery = `
      SELECT id, email, anonymous_id, role, status, created_at
      FROM users
      WHERE 1=1
    `;
    const params = [];
    
    if (search) {
      params.push(`%${search}%`);
      usersQuery += ` AND (email ILIKE $${params.length} OR anonymous_id ILIKE $${params.length})`;
    }
    
    if (status) {
      params.push(status);
      usersQuery += ` AND status = $${params.length}`;
    }
    
    usersQuery += ' ORDER BY created_at DESC LIMIT 100';
    
    const result = await query(usersQuery, params);
    
    res.json({
      success: true,
      data: {
        users: result.rows
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

const getReports = async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*,
             reporter.anonymous_id as reporter_anonymous_id,
             reported.anonymous_id as reported_anonymous_id,
             resolver.anonymous_id as resolver_anonymous_id
      FROM reports r
      JOIN users reporter ON r.reporter_id = reporter.id
      JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN users resolver ON r.resolved_by = resolver.id
      ORDER BY r.created_at DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      data: {
        reports: result.rows
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
};

const updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'reviewing', 'resolved', 'rejected'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    const result = await query(
      `UPDATE reports
       SET status = $1,
           resolved_at = CASE WHEN $1 IN ('resolved', 'rejected') THEN CURRENT_TIMESTAMP ELSE resolved_at END,
           resolved_by = CASE WHEN $1 IN ('resolved', 'rejected') THEN $2 ELSE resolved_by END
       WHERE id = $3
       RETURNING id, status, resolved_at`,
      [status, req.user.id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'update_report_status', 'report', $2, $3)`,
      [req.user.id, id, JSON.stringify({ status })]
    );
    
    res.json({
      success: true,
      data: {
        report: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update report'
    });
  }
};

const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, duration } = req.body;
    
    if (!reason || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Reason and duration are required'
      });
    }
    
    if (!['temporary', 'permanent'].includes(duration)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration'
      });
    }
    
    const targetUser = await query('SELECT id FROM users WHERE id = $1', [id]);
    
    if (targetUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const expiresAt = duration === 'permanent' ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await query(
      `INSERT INTO bans (user_id, reason, duration, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, reason, duration, expiresAt, req.user.id]
    );
    
    await query(
      `UPDATE users SET status = 'banned', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    await query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [id]
    );
    
    await query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1',
      [id]
    );
    
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'ban_user', 'user', $2, $3)`,
      [req.user.id, id, JSON.stringify({ reason, duration })]
    );
    
    res.json({
      success: true,
      message: 'User banned successfully'
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban user'
    });
  }
};

const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      `UPDATE bans SET status = 'lifted'
       WHERE user_id = $1 AND status = 'active'`,
      [id]
    );
    
    await query(
      `UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'unban_user', 'user', $2, $3)`,
      [req.user.id, id, JSON.stringify({ action: 'unban' })]
    );
    
    res.json({
      success: true,
      message: 'User unbanned successfully'
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unban user'
    });
  }
};

const suspendUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    await query(
      `UPDATE users SET status = 'suspended', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id]
    );
    
    await query(
      `UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [id]
    );
    
    await query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1',
      [id]
    );
    
    await query(
      `INSERT INTO audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1, 'suspend_user', 'user', $2, $3)`,
      [req.user.id, id, JSON.stringify({ action: 'suspend' })]
    );
    
    res.json({
      success: true,
      message: 'User suspended successfully'
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend user'
    });
  }
};

const getActiveRooms = async (req, res) => {
  try {
    const result = await query(`
      SELECT cr.id, cr.room_code, cr.status, cr.created_at,
             COUNT(rm.id) as member_count,
             json_agg(json_build_object('anonymous_id', u.anonymous_id, 'user_id', u.id)) as members
      FROM chat_rooms cr
      LEFT JOIN room_members rm ON cr.id = rm.room_id AND rm.left_at IS NULL
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE cr.status = 'active'
      GROUP BY cr.id
      ORDER BY cr.created_at DESC
    `);
    
    res.json({
      success: true,
      data: {
        rooms: result.rows
      }
    });
  } catch (error) {
    console.error('Get active rooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active rooms'
    });
  }
};

const getMatchmakingQueue = async (req, res) => {
  try {
    const result = await query(`
      SELECT mq.*, u.anonymous_id, u.email
      FROM matchmaking_queue mq
      JOIN users u ON mq.user_id = u.id
      WHERE mq.expires_at > CURRENT_TIMESTAMP
      ORDER BY mq.created_at ASC
    `);
    
    res.json({
      success: true,
      data: {
        queue: result.rows
      }
    });
  } catch (error) {
    console.error('Get matchmaking queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch matchmaking queue'
    });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const result = await query(`
      SELECT al.*, u.anonymous_id as admin_anonymous_id
      FROM audit_logs al
      LEFT JOIN users u ON al.admin_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      data: {
        logs: result.rows
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs'
    });
  }
};

module.exports = {
  getStats,
  getUsers,
  getReports,
  updateReportStatus,
  banUser,
  unbanUser,
  suspendUser,
  getActiveRooms,
  getMatchmakingQueue,
  getAuditLogs
};
