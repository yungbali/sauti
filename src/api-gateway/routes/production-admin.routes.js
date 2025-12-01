/**
 * Production Admin Routes
 */

const express = require('express');
const router = express.Router();
const adminService = require('../../services/production/admin.service');
const { logger } = require('../../common/logger');

// Middleware to check admin permissions (Simplified for MVP)
const checkAdminAuth = (req, res, next) => {
    const apiKey = req.headers['x-admin-key'];
    // In production, use a secure comparison and environment variable
    if (process.env.ADMIN_API_KEY && apiKey === process.env.ADMIN_API_KEY) {
        return next();
    }

    // For MVP/Demo without env var set, allow local requests or specific header
    if (process.env.NODE_ENV === 'development' || !process.env.ADMIN_API_KEY) {
        return next();
    }

    res.status(401).json({ error: 'Unauthorized' });
};

router.use(checkAdminAuth);

// Get global stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await adminService.getGlobalStats();
        res.json(stats);
    } catch (error) {
        logger.error('Failed to get admin stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get sessions
router.get('/sessions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const result = await adminService.getAllSessions(limit, offset);
        res.json(result);
    } catch (error) {
        logger.error('Failed to get sessions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Terminate session
router.delete('/sessions/:id', async (req, res) => {
    try {
        const result = await adminService.terminateSession(req.params.id);
        res.json(result);
    } catch (error) {
        logger.error('Failed to terminate session:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
