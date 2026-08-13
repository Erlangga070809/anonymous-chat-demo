const { query } = require('../db');

const getSettings = async (req, res) => {
  try {
    const result = await query(
      `SELECT language, notifications_enabled, sound_enabled
       FROM user_settings
       WHERE user_id = $1`,
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      const defaultSettings = {
        language: 'en',
        notifications_enabled: true,
        sound_enabled: true
      };
      
      await query(
        `INSERT INTO user_settings (user_id, language, notifications_enabled, sound_enabled)
         VALUES ($1, $2, $3, $4)`,
        [req.user.id, defaultSettings.language, defaultSettings.notifications_enabled, defaultSettings.sound_enabled]
      );
      
      return res.json({
        success: true,
        data: {
          settings: defaultSettings
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        settings: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { language, notifications_enabled, sound_enabled } = req.body;
    
    const validLanguages = ['en', 'id'];
    
    if (language && !validLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language'
      });
    }
    
    const result = await query(
      `UPDATE user_settings
       SET language = COALESCE($1, language),
           notifications_enabled = COALESCE($2, notifications_enabled),
           sound_enabled = COALESCE($3, sound_enabled),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $4
       RETURNING language, notifications_enabled, sound_enabled`,
      [language, notifications_enabled, sound_enabled, req.user.id]
    );
    
    res.json({
      success: true,
      data: {
        settings: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
};

module.exports = { getSettings, updateSettings };
