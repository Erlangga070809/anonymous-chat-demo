const { query } = require('../db');
const { validateReportReason, sanitizeInput } = require('../utils/validator');

const createReport = async (req, res) => {
  try {
    const { reportedUserId, roomId, reason, description } = req.body;
    
    if (!reportedUserId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Reported user and reason are required'
      });
    }
    
    if (!validateReportReason(reason)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report reason'
      });
    }
    
    if (reportedUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report yourself'
      });
    }
    
    const cleanDescription = description ? sanitizeInput(description) : null;
    
    const result = await query(
      `INSERT INTO reports (reporter_id, reported_user_id, room_id, reason, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, reason, status, created_at`,
      [req.user.id, reportedUserId, roomId, reason, cleanDescription]
    );
    
    res.status(201).json({
      success: true,
      data: {
        report: result.rows[0]
      },
      message: 'Report submitted successfully'
    });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
};

const getMyReports = async (req, res) => {
  try {
    const result = await query(
      `SELECT r.id, r.reason, r.description, r.status, r.created_at, r.resolved_at,
              u.anonymous_id as reported_user_anonymous_id
       FROM reports r
       JOIN users u ON r.reported_user_id = u.id
       WHERE r.reporter_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        reports: result.rows
      }
    });
  } catch (error) {
    console.error('Get my reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports'
    });
  }
};

module.exports = { createReport, getMyReports };
