/**
 * Production Admin Service
 * System monitoring and management
 */

const { logger } = require('../../common/logger');
const { getAdminClient } = require('../../config/supabase.config');
const webSocketService = require('./websocket.service');

class AdminService {
    constructor() {
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            this.supabase = await getAdminClient();
            logger.info('Admin Service initialized');
        } catch (error) {
            logger.error('Failed to initialize Admin Service:', error);
        }
    }

    /**
     * Get global system statistics
     */
    async getGlobalStats() {
        const stats = {
            system: {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                nodeVersion: process.version,
                timestamp: new Date().toISOString()
            },
            realtime: {
                activeConnections: webSocketService.getConnectionCount()
            },
            database: {
                status: this.supabase ? 'connected' : 'disconnected'
            }
        };

        if (this.supabase) {
            try {
                // Get active session count (last 24h)
                const { count: sessionCount } = await this.supabase
                    .from('streaming_sessions')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

                // Get total assets
                const { count: assetCount } = await this.supabase
                    .from('assets')
                    .select('*', { count: 'exact', head: true });

                stats.database.activeSessions24h = sessionCount;
                stats.database.totalAssets = assetCount;
            } catch (error) {
                logger.warn('Failed to fetch DB stats:', error);
            }
        }

        return stats;
    }

    /**
     * Get all active sessions
     */
    async getAllSessions(limit = 50, offset = 0) {
        if (!this.supabase) {
            return { sessions: [], total: 0 };
        }

        try {
            const { data, error, count } = await this.supabase
                .from('streaming_sessions')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;

            return {
                sessions: data,
                total: count,
                limit,
                offset
            };
        } catch (error) {
            logger.error('Failed to get sessions:', error);
            throw new Error('Failed to fetch sessions');
        }
    }

    /**
     * Terminate a session
     */
    async terminateSession(sessionId) {
        logger.info(`Terminating session ${sessionId}`);

        if (!this.supabase) {
            throw new Error('Database not configured');
        }

        try {
            // In a real scenario, we might also want to revoke a token or close a specific socket
            // For now, we'll just delete the record to "end" it from an analytics perspective
            const { error } = await this.supabase
                .from('streaming_sessions')
                .delete()
                .eq('session_id', sessionId);

            if (error) throw error;

            return { success: true, sessionId };
        } catch (error) {
            logger.error('Failed to terminate session:', error);
            throw new Error('Failed to terminate session');
        }
    }
}

const adminService = new AdminService();
module.exports = adminService;
