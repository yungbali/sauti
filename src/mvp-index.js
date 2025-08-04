/**
 * Sauti Media BaaS - MVP Entry Point
 * Simplified version focused on core African media distribution features
 */

// Set environment before loading anything else
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.USE_AWS_SECRETS_MANAGER = process.env.USE_AWS_SECRETS_MANAGER || 'false';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { logger } = require('./common/logger');

// Core MVP services only
const { setupMvpIngestRoutes } = require('./api-gateway/routes/mvp-ingest.routes');
const { setupMvpStreamingRoutes } = require('./api-gateway/routes/mvp-streaming.routes');
const { setupMvpAdRoutes } = require('./api-gateway/routes/mvp-ad.routes');
const { setupMvpHealthRoutes } = require('./api-gateway/routes/mvp-health.routes');

/**
 * Create and configure Express app for MVP
 */
function createMvpApp() {
  const app = express();
  
  // Basic security and middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
  }));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 1000, // Generous for development
    message: 'Too many requests from this IP'
  });
  app.use(limiter);
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  
  // Request logging
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    next();
  });
  
  // MVP API Routes - Core features only
  const apiPrefix = process.env.API_PREFIX || '/v1';
  
  // Core media features
  app.use(`${apiPrefix}/ingest`, setupMvpIngestRoutes());
  app.use(`${apiPrefix}/streaming`, setupMvpStreamingRoutes());
  app.use(`${apiPrefix}/ads`, setupMvpAdRoutes());
  
  // Health and status
  app.use('/health', setupMvpHealthRoutes());
  
  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Sauti Media BaaS MVP',
      version: '1.0.0',
      description: 'African-optimized media distribution backend',
      features: [
        'Media Ingestion via Mux',
        'African ISP-optimized streaming',
        'Ad insertion and monetization',
        'Mobile-first delivery'
      ],
      endpoints: {
        ingest: `${apiPrefix}/ingest`,
        streaming: `${apiPrefix}/streaming`,
        ads: `${apiPrefix}/ads`,
        health: '/health'
      }
    });
  });
  
  // Simple API docs endpoint
  app.get(`${apiPrefix}/docs`, (req, res) => {
    res.json({
      title: 'Sauti Media BaaS API',
      description: 'Simplified API for African media distribution',
      endpoints: {
        'POST /v1/ingest/upload': 'Create direct upload URL',
        'POST /v1/ingest/import': 'Import media from URL',
        'GET /v1/ingest/jobs/:jobId': 'Get ingest job status',
        'GET /v1/streaming/:assetId': 'Get optimized streaming URLs',
        'POST /v1/ads/cuepoints/:assetId': 'Create ad cue points',
        'GET /v1/ads/cuepoints/:assetId': 'Get ad cue points',
        'GET /health': 'Health check endpoint'
      }
    });
  });
  
  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Endpoint not found',
      message: `${req.method} ${req.path} is not available`,
      availableEndpoints: [
        `${apiPrefix}/ingest`,
        `${apiPrefix}/streaming`, 
        `${apiPrefix}/ads`,
        '/health'
      ]
    });
  });
  
  // Error handler
  app.use((error, req, res, next) => {
    logger.error('API Error:', error);
    res.status(error.status || 500).json({
      error: error.message || 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  });
  
  return app;
}

/**
 * Start the MVP server
 */
async function startMvpServer() {
  try {
    logger.info('🚀 Starting Sauti Media BaaS MVP...');
    
    // Create storage directory
    const fs = require('fs');
    if (!fs.existsSync('./storage')) {
      fs.mkdirSync('./storage', { recursive: true });
    }
    
    const app = createMvpApp();
    const PORT = process.env.PORT || 3000;
    
    const server = app.listen(PORT, () => {
      logger.info(`✅ Sauti Media BaaS MVP running on port ${PORT}`);
      logger.info(`📖 API Documentation: http://localhost:${PORT}/v1/docs`);
      logger.info(`❤️ Health Check: http://localhost:${PORT}/health`);
      logger.info('');
      logger.info('🌍 African Media Distribution Features:');
      logger.info('   📤 Media Ingestion via Mux');
      logger.info('   🎬 African ISP-optimized streaming');
      logger.info('   💰 Ad insertion and monetization');
      logger.info('   📱 Mobile-first delivery');
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error('Failed to start MVP server:', error);
    process.exit(1);
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  startMvpServer();
}

module.exports = { createMvpApp, startMvpServer };