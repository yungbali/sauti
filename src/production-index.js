/**
 * Production Entry Point - African Media BaaS
 * Real Mux + Supabase integration with African optimizations
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const { logger } = require('./common/logger');
const { getMuxClient, isConfigured: isMuxConfigured } = require('./config/mux.config');
const { getClient: getSupabaseClient, isConfigured: isSupabaseConfigured } = require('./config/supabase.config');

// Import production services
const ingestService = require('./services/production/ingest.service');
const streamingService = require('./services/production/streaming.service');
const adService = require('./services/production/ad.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            mediaSrc: ["'self'", "https://stream.mux.com", "https://image.mux.com", "https://upload.mux.com"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.mux.com"]
        }
    }
}));

// CORS configuration for African markets
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        // Allow all origins in development
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        // In production, you should specify allowed origins
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
            process.env.ALLOWED_ORIGINS.split(',') : 
            ['https://yourdomain.com'];
            
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// Rate limiting (higher limits for African mobile networks)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Higher limit for mobile users
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const userAgent = req.get('user-agent') || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;
    logger.info(`${req.method} ${req.path}`, { ip, userAgent });
    next();
});

// Health check endpoint  
app.get('/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0-production',
        services: {
            mux: await isMuxConfigured() ? 'operational' : 'configuration-needed',
            supabase: await isSupabaseConfigured() ? 'operational' : 'configuration-needed',
            ingest: 'operational',
            streaming: 'operational',
            ads: 'operational'
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB'
        },
        environment: process.env.NODE_ENV || 'development',
        awsSecretsManager: process.env.USE_AWS_SECRETS_MANAGER === 'true' || !!process.env.AWS_SECRET_NAME
    };
    
    res.json(health);
});

// Root endpoint - API information
app.get('/', async (req, res) => {
    res.json({
        name: 'Sauti Media BaaS Production',
        version: '1.0.0',
        description: 'African-optimized media distribution backend with real Mux + Supabase integration',
        features: [
            'Real Mux integration for video processing',
            'Supabase database for data persistence', 
            'African ISP-optimized streaming',
            'Production-ready ad insertion',
            'Mobile-first delivery optimizations',
            'AWS Secrets Manager integration'
        ],
        endpoints: {
            ingest: '/v1/ingest',
            streaming: '/v1/streaming',
            ads: '/v1/ads',
            health: '/health'
        },
        configuration: {
            mux: await isMuxConfigured(),
            supabase: await isSupabaseConfigured(),
            awsSecretsManager: process.env.USE_AWS_SECRETS_MANAGER === 'true' || !!process.env.AWS_SECRET_NAME,
            environment: process.env.NODE_ENV || 'development'
        }
    });
});

// API Documentation
app.get('/v1/docs', (req, res) => {
    res.json({
        title: 'Sauti Media BaaS Production API',
        description: 'Production API with real Mux and Supabase integration',
        version: '1.0.0',
        endpoints: {
            'POST /v1/ingest/upload': 'Create real Mux direct upload URL',
            'POST /v1/ingest/import': 'Import media from URL via Mux',
            'GET /v1/ingest/jobs/:jobId': 'Get real job status from Mux',
            'GET /v1/streaming/:assetId': 'Get African-optimized streaming URLs',
            'GET /v1/streaming/:assetId/analytics': 'Get streaming analytics from Supabase',
            'POST /v1/ads/cuepoints/:assetId': 'Create ad cue points in Supabase',
            'GET /v1/ads/cuepoints/:assetId': 'Get ad cue points from Supabase',
            'GET /v1/ads/:assetId/vast/:cuePointId': 'Generate VAST response for African markets',
            'GET /health': 'Health check with service status'
        },
        configuration: {
            requiresMuxCredentials: 'Set MUX_TOKEN_ID and MUX_TOKEN_SECRET',
            requiresSupabase: 'Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY',
            databaseSchema: 'Run database.sql to set up Supabase tables'
        }
    });
});

// Validation middleware
const validateUpload = [
    body('corsOrigin').isURL().withMessage('Valid CORS origin is required'),
    body('contentType').optional().isIn(['video', 'audio']).withMessage('Content type must be video or audio')
];

const validateImport = [
    body('url').isURL().withMessage('Valid URL is required'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
];

const validateCuePoint = [
    body('type').isIn(['pre-roll', 'mid-roll', 'post-roll']).withMessage('Type must be pre-roll, mid-roll, or post-roll'),
    body('duration').isInt({ min: 5, max: 120 }).withMessage('Duration must be between 5 and 120 seconds'),
    body('timeOffset').optional().isInt({ min: 0 }).withMessage('Time offset must be >= 0')
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// INGEST ROUTES
app.post('/v1/ingest/upload', validateUpload, handleValidationErrors, async (req, res) => {
    try {
        const result = await ingestService.createDirectUpload(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Upload creation failed:', error);
        res.status(500).json({ 
            error: 'Failed to create upload URL',
            message: error.message,
            configured: await isMuxConfigured()
        });
    }
});

app.post('/v1/ingest/import', validateImport, handleValidationErrors, async (req, res) => {
    try {
        const result = await ingestService.importFromUrl(req.body);
        res.json(result);
    } catch (error) {
        logger.error('Import failed:', error);
        res.status(500).json({ 
            error: 'Failed to import media',
            message: error.message,
            configured: await isMuxConfigured()
        });
    }
});

app.get('/v1/ingest/jobs/:jobId', async (req, res) => {
    try {
        const result = await ingestService.getJobStatus(req.params.jobId);
        res.json(result);
    } catch (error) {
        logger.error('Job status failed:', error);
        res.status(500).json({ 
            error: 'Failed to get job status',
            message: error.message,
            configured: await isMuxConfigured()
        });
    }
});

// STREAMING ROUTES
app.get('/v1/streaming/:assetId', async (req, res) => {
    try {
        const options = {
            country: req.query.country,
            deviceType: req.query.deviceType,
            connectionType: req.query.connectionType,
            isp: req.query.isp,
            ip: req.ip
        };
        
        logger.info('Getting streaming URLs (Production)', { 
            assetId: req.params.assetId, 
            options 
        });
        
        const result = await streamingService.getOptimizedStreamingUrls(req.params.assetId, options);
        res.json(result);
    } catch (error) {
        logger.error('Streaming URLs failed:', error);
        res.status(500).json({ 
            error: 'Failed to get streaming URLs',
            message: error.message 
        });
    }
});

app.get('/v1/streaming/:assetId/analytics', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        const result = await streamingService.getStreamingAnalytics(req.params.assetId, timeRange);
        res.json(result);
    } catch (error) {
        logger.error('Streaming analytics failed:', error);
        res.status(500).json({ 
            error: 'Failed to get streaming analytics',
            message: error.message 
        });
    }
});

// AD ROUTES
app.post('/v1/ads/cuepoints/:assetId', validateCuePoint, handleValidationErrors, async (req, res) => {
    try {
        logger.info('Creating ad cue point (Production)', { 
            assetId: req.params.assetId, 
            cuePointData: req.body 
        });
        
        const result = await adService.createAdCuePoint(req.params.assetId, req.body);
        
        logger.info('Ad cue point created', { 
            cuePointId: result.id,
            assetId: req.params.assetId 
        });
        
        res.json(result);
    } catch (error) {
        logger.error('Cue point creation failed:', error);
        res.status(500).json({ 
            error: 'Failed to create cue point',
            message: error.message,
            configured: await isSupabaseConfigured()
        });
    }
});

app.get('/v1/ads/cuepoints/:assetId', async (req, res) => {
    try {
        const result = await adService.getAdCuePoints(req.params.assetId);
        res.json(result);
    } catch (error) {
        logger.error('Get cue points failed:', error);
        res.status(500).json({ 
            error: 'Failed to get cue points',
            message: error.message,
            configured: await isSupabaseConfigured()
        });
    }
});

app.get('/v1/ads/:assetId/vast/:cuePointId', async (req, res) => {
    try {
        const options = {
            country: req.query.country,
            deviceType: req.query.deviceType,
            language: req.query.language,
            userAgent: req.get('user-agent')
        };
        
        const result = await adService.generateVASTResponse(
            req.params.assetId, 
            req.params.cuePointId, 
            options
        );
        
        res.set('Content-Type', 'application/xml');
        res.send(result.vastXml);
    } catch (error) {
        logger.error('VAST generation failed:', error);
        res.status(500).json({ 
            error: 'Failed to generate VAST response',
            message: error.message 
        });
    }
});

app.get('/v1/ads/:assetId/analytics', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        const result = await adService.getAdAnalytics(req.params.assetId, timeRange);
        res.json(result);
    } catch (error) {
        logger.error('Ad analytics failed:', error);
        res.status(500).json({ 
            error: 'Failed to get ad analytics',
            message: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `${req.method} ${req.originalUrl} not found`,
        availableEndpoints: [
            'GET /',
            'GET /health',
            'GET /v1/docs',
            'POST /v1/ingest/upload',
            'POST /v1/ingest/import',
            'GET /v1/ingest/jobs/:jobId',
            'GET /v1/streaming/:assetId',
            'GET /v1/streaming/:assetId/analytics',
            'POST /v1/ads/cuepoints/:assetId',
            'GET /v1/ads/cuepoints/:assetId',
            'GET /v1/ads/:assetId/vast/:cuePointId',
            'GET /v1/ads/:assetId/analytics'
        ]
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start server
app.listen(PORT, async () => {
    logger.info('🚀 Starting Sauti Media BaaS Production...');
    logger.info('📋 Production Configuration:');
    logger.info(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`   🔐 AWS Secrets Manager: ${process.env.USE_AWS_SECRETS_MANAGER === 'true' || process.env.AWS_SECRET_NAME ? 'Enabled' : 'Disabled'}`);
    logger.info(`   🎬 Mux: ${await isMuxConfigured() ? 'Configured' : 'Not configured - check AWS Secrets Manager or environment variables'}`);
    logger.info(`   💾 Supabase: ${await isSupabaseConfigured() ? 'Configured' : 'Not configured - check AWS Secrets Manager or environment variables'}`);
    logger.info(`   🎬 Video Processing: Real Mux integration`);
    logger.info(`   🌐 Server: http://localhost:${PORT}`);
    logger.info('');
    logger.info('✅ Sauti Media BaaS Production running!');
    logger.info('📖 API Documentation: http://localhost:' + PORT + '/v1/docs');
    logger.info('❤️ Health Check: http://localhost:' + PORT + '/health');
    logger.info('');
    logger.info('🌍 Production African Media Distribution Features:');
    logger.info('   📤 Real Mux media ingestion');
    logger.info('   🎬 African ISP-optimized streaming');
    logger.info('   💰 Supabase-powered ad insertion');
    logger.info('   📱 Production mobile-first delivery');
    logger.info('   ☁️ AWS Secrets Manager integration');
});