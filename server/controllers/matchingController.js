const { query, getClient } = require('../db');
const { v4: uuidv4 } = require('uuid');

const startMatching = async (req, res) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    await client.query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1',
      [req.user.id]
    );
    
    const existingRoom = await client.query(
      `SELECT room_id FROM room_members
       WHERE user_id = $1 AND left_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );
    
    if (existingRoom.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Already in an active chat'
      });
    }
    
    const blocksResult = await client.query(
      'SELECT blocked_id FROM blocks WHERE blocker_id = $1',
      [req.user.id]
    );
    const blockedIds = blocksResult.rows.map(r => r.blocked_id);
    
    const blocksOnUserResult = await client.query(
      'SELECT blocker_id FROM blocks WHERE blocked_id = $1',
      [req.user.id]
    );
    const blockedByIds = blocksOnUserResult.rows.map(r => r.blocker_id);
    
    const allBlockedIds = [...new Set([...blockedIds, ...blockedByIds])];
    
    const placeholders = allBlockedIds.map((_, i) => `$${i + 1}`).join(',');
    
    let matchQuery = `
      SELECT mq.user_id, mq.id as queue_id
      FROM matchmaking_queue mq
      JOIN users u ON mq.user_id = u.id
      WHERE mq.user_id != $1
      AND mq.expires_at > CURRENT_TIMESTAMP
      AND u.status = 'active'
    `;
    
    const params = [req.user.id];
    
    if (allBlockedIds.length > 0) {
      matchQuery += ` AND mq.user_id NOT IN (${placeholders})`;
      params.push(...allBlockedIds);
    }
    
    matchQuery += ' ORDER BY mq.created_at ASC LIMIT 1';
    
    const match = await client.query(matchQuery, params);
    
    if (match.rows.length === 0) {
      await client.query(
        `INSERT INTO matchmaking_queue (user_id, created_at, expires_at)
         VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`,
        [req.user.id]
      );
      
      await client.query('COMMIT');
      
      return res.json({
        success: true,
        data: {
          status: 'searching',
          message: 'Searching for someone...'
        }
      });
    }
    
    const matchedUserId = match.rows[0].user_id;
    
    await client.query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1 OR user_id = $2',
      [req.user.id, matchedUserId]
    );
    
    const roomCode = uuidv4().replace(/-/g, '').substring(0, 20);
    
    const roomResult = await client.query(
      `INSERT INTO chat_rooms (room_code)
       VALUES ($1)
       RETURNING id, room_code`,
      [roomCode]
    );
    
    const roomId = roomResult.rows[0].id;
    
    await client.query(
      `INSERT INTO room_members (room_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [roomId, req.user.id, matchedUserId]
    );
    
    const matchedUserResult = await client.query(
      'SELECT id, anonymous_id FROM users WHERE id = $1',
      [matchedUserId]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: {
        status: 'matched',
        room: {
          id: roomId,
          room_code: roomCode,
          matched_user: matchedUserResult.rows[0]
        }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Start matching error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start matching'
    });
  } finally {
    client.release();
  }
};

const stopMatching = async (req, res) => {
  try {
    await query(
      'DELETE FROM matchmaking_queue WHERE user_id = $1',
      [req.user.id]
    );
    
    res.json({
      success: true,
      message: 'Stopped searching'
    });
  } catch (error) {
    console.error('Stop matching error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop matching'
    });
  }
};

const getMatchingStatus = async (req, res) => {
  try {
    const result = await query(
      `SELECT mq.*, u.anonymous_id
       FROM matchmaking_queue mq
       JOIN users u ON mq.user_id = u.id
       WHERE mq.user_id = $1 AND mq.expires_at > CURRENT_TIMESTAMP`,
      [req.user.id]
    );
    
    if (result.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          status: 'searching',
          queueInfo: result.rows[0]
        }
      });
    }
    
    const activeRoom = await query(
      `SELECT cr.id, cr.room_code, cr.status
       FROM chat_rooms cr
       JOIN room_members rm ON cr.id = rm.room_id
       WHERE rm.user_id = $1 AND rm.left_at IS NULL AND cr.status = 'active'
       LIMIT 1`,
      [req.user.id]
    );
    
    if (activeRoom.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          status: 'matched',
          room: activeRoom.rows[0]
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        status: 'idle'
      }
    });
  } catch (error) {
    console.error('Get matching status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get matching status'
    });
  }
};

const stopChat = async (req, res) => {
  try {
    const { roomId } = req.body;
    
    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID is required'
      });
    }
    
    await query(
      `UPDATE room_members SET left_at = CURRENT_TIMESTAMP
       WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, req.user.id]
    );
    
    const activeMembers = await query(
      `SELECT COUNT(*) as count FROM room_members
       WHERE room_id = $1 AND left_at IS NULL`,
      [roomId]
    );
    
    if (parseInt(activeMembers.rows[0].count) === 0) {
      await query(
        `UPDATE chat_rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [roomId]
      );
    }
    
    res.json({
      success: true,
      message: 'Chat stopped successfully'
    });
  } catch (error) {
    console.error('Stop chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop chat'
    });
  }
};

module.exports = {
  startMatching,
  stopMatching,
  getMatchingStatus,
  stopChat
};
