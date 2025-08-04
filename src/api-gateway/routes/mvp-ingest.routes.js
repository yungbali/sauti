/**
 * MVP Ingest Routes - Simplified media ingestion endpoints
 */
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { logger } = require('../../common/logger');
const ingestMvpService = require('../../services/mvp/ingest-mvp.service');

function setupMvpIngestRoutes() {
  const router = express.Router();
  
  // Validation middleware
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
  
  /**
   * POST /upload - Create direct upload URL
   */
  router.post('/upload', [
    body('corsOrigin').isURL().withMessage('Valid CORS origin is required'),
    body('contentType').optional().isIn(['video', 'audio']).withMessage('Content type must be video or audio'),
    body('metadata').optional().isObject()
  ], handleValidationErrors, async (req, res) => {
    try {
      const result = await ingestMvpService.createDirectUpload(req.body);
      res.status(201).json(result);
    } catch (error) {
      logger.error('Upload creation failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /import - Import from URL
   */
  router.post('/import', [
    body('url').isURL().withMessage('Valid media URL is required'),
    body('contentType').optional().isIn(['video', 'audio']),
    body('metadata').optional().isObject()
  ], handleValidationErrors, async (req, res) => {
    try {
      const result = await ingestMvpService.importFromUrl(req.body);
      res.status(202).json(result);
    } catch (error) {
      logger.error('Import failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * GET /jobs/:jobId - Get job status
   */
  router.get('/jobs/:jobId', [
    param('jobId').notEmpty().withMessage('Job ID is required')
  ], handleValidationErrors, async (req, res) => {
    try {
      const result = await ingestMvpService.getJobStatus(req.params.jobId);
      res.json(result);
    } catch (error) {
      logger.error('Job status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * GET /uploads/:uploadId - Get upload status
   */
  router.get('/uploads/:uploadId', [
    param('uploadId').notEmpty().withMessage('Upload ID is required')
  ], handleValidationErrors, async (req, res) => {
    try {
      const result = await ingestMvpService.getUploadStatus(req.params.uploadId);
      res.json(result);
    } catch (error) {
      logger.error('Upload status fetch failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * POST /webhook - Process Mux webhooks
   */
  router.post('/webhook', async (req, res) => {
    try {
      const signature = req.headers['mux-signature'];
      const result = await ingestMvpService.processWebhook(req.body, signature);
      res.json(result);
    } catch (error) {
      logger.error('Webhook processing failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  return router;
}

module.exports = { setupMvpIngestRoutes };