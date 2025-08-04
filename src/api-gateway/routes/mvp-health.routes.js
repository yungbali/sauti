/**
 * MVP Health Routes - Simple health checks
 */
const express = require('express');
const { logger } = require('../../common/logger');

function setupMvpHealthRoutes() {
  const router = express.Router();
  
  /**
   * GET / - Basic health check
   */
  router.get('/', (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0-mvp',
      services: {
        ingest: 'operational',
        streaming: 'operational', 
        ads: 'operational'
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    };
    
    res.json(health);
  });
  
  /**
   * GET /ready - Readiness check
   */
  router.get('/ready', (req, res) => {
    // Simple readiness check for MVP
    const ready = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        storage: fs.existsSync('./storage') ? 'pass' : 'fail',
        memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'pass' : 'warn' // 500MB
      }
    };
    
    const allPass = Object.values(ready.checks).every(check => check === 'pass');
    res.status(allPass ? 200 : 503).json(ready);
  });
  
  /**
   * GET /live - Liveness check  
   */
  router.get('/live', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid
    });
  });
  
  return router;
}

// Import fs for readiness check
const fs = require('fs');

module.exports = { setupMvpHealthRoutes };