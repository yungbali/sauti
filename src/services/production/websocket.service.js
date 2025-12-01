/**
 * Production WebSocket Service
 * Real-time updates for dashboards and clients
 */

const { Server } = require('socket.io');
const { logger } = require('../../common/logger');

class WebSocketService {
    constructor() {
        this.io = null;
        this.connections = new Map();
    }

    /**
     * Initialize Socket.io with the HTTP server
     */
    init(httpServer) {
        try {
            this.io = new Server(httpServer, {
                cors: {
                    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
                    methods: ["GET", "POST"]
                }
            });

            this.setupEventHandlers();

            logger.info('WebSocket Service initialized');
        } catch (error) {
            logger.error('Failed to initialize WebSocket Service:', error);
        }
    }

    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const clientIp = socket.handshake.address;
            logger.info(`New WebSocket connection: ${socket.id} from ${clientIp}`);

            this.connections.set(socket.id, {
                connectedAt: new Date(),
                ip: clientIp
            });

            // Room subscription for specific assets (e.g., for viewer counts)
            socket.on('subscribe_asset', (assetId) => {
                socket.join(`asset_${assetId}`);
                logger.debug(`Socket ${socket.id} subscribed to asset_${assetId}`);
            });

            // Room subscription for job updates (e.g., ingest status)
            socket.on('subscribe_job', (jobId) => {
                socket.join(`job_${jobId}`);
                logger.debug(`Socket ${socket.id} subscribed to job_${jobId}`);
            });

            socket.on('disconnect', () => {
                this.connections.delete(socket.id);
                logger.info(`WebSocket disconnected: ${socket.id}`);
            });
        });
    }

    /**
     * Broadcast job status update to subscribed clients
     */
    broadcastJobUpdate(jobId, status, data = {}) {
        if (!this.io) return;

        this.io.to(`job_${jobId}`).emit('job_update', {
            jobId,
            status,
            timestamp: new Date().toISOString(),
            ...data
        });

        logger.debug(`Broadcasted update for job ${jobId}: ${status}`);
    }

    /**
     * Broadcast viewer count update for an asset
     */
    broadcastViewerCount(assetId, count) {
        if (!this.io) return;

        this.io.to(`asset_${assetId}`).emit('viewer_count', {
            assetId,
            count,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get current connection count
     */
    getConnectionCount() {
        return this.connections.size;
    }
}

const webSocketService = new WebSocketService();
module.exports = webSocketService;
