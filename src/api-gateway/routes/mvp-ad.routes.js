/**
 * MVP Ad Routes - Simplified ad insertion and monetization
 */
const express = require("express");
const { body, param, query, validationResult } = require("express-validator");
const { logger } = require("../../common/logger");
const adMvpService = require("../../services/mvp/ad-mvp.service");

function setupMvpAdRoutes() {
  const router = express.Router();

  const userContextValidators = [
    query("country")
      .optional()
      .isLength({ min: 2, max: 2 })
      .withMessage("Country must be 2-letter ISO code"),
    query("language")
      .optional()
      .isLength({ min: 2, max: 8 })
      .withMessage("Language must be a locale code"),
    query("deviceType").optional().isIn(["mobile", "tablet", "desktop", "tv"]),
    query("connectionType")
      .optional()
      .isIn(["cellular", "wifi", "wired", "slow"]),
    query("isp").optional().isString().trim().isLength({ min: 2, max: 32 }),
  ];

  const buildUserContext = (req) => ({
    country: req.query.country || "KE",
    language: req.query.language || "en",
    deviceType: req.query.deviceType || "mobile",
    connectionType: req.query.connectionType || "cellular",
    isp: req.query.isp || "auto",
  });

  // Validation middleware
  const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array(),
      });
    }
    next();
  };

  /**
   * POST /cuepoints/:assetId - Create ad cue point
   */
  router.post(
    "/cuepoints/:assetId",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      body("type")
        .isIn(["pre-roll", "mid-roll", "post-roll"])
        .withMessage("Type must be pre-roll, mid-roll, or post-roll"),
      body("timeOffset")
        .optional()
        .isNumeric()
        .withMessage("Time offset must be a number"),
      body("duration")
        .optional()
        .isNumeric()
        .withMessage("Duration must be a number"),
      body("targeting").optional().isObject(),
      body("metadata").optional().isObject(),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.createCuePoint(
          req.params.assetId,
          req.body,
        );
        res.status(201).json(result);
      } catch (error) {
        logger.error("Cue point creation failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /cuepoints/:assetId - Get all cue points for asset
   */
  router.get(
    "/cuepoints/:assetId",
    [param("assetId").notEmpty().withMessage("Asset ID is required")],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.getCuePoints(req.params.assetId);
        res.json(result);
      } catch (error) {
        logger.error("Cue points fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * PUT /cuepoints/:assetId/:cuePointId - Update cue point
   */
  router.put(
    "/cuepoints/:assetId/:cuePointId",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      param("cuePointId").notEmpty().withMessage("Cue point ID is required"),
      body("type").optional().isIn(["pre-roll", "mid-roll", "post-roll"]),
      body("timeOffset").optional().isNumeric(),
      body("duration").optional().isNumeric(),
      body("targeting").optional().isObject(),
      body("metadata").optional().isObject(),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.updateCuePoint(
          req.params.assetId,
          req.params.cuePointId,
          req.body,
        );
        res.json(result);
      } catch (error) {
        logger.error("Cue point update failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * DELETE /cuepoints/:assetId/:cuePointId - Delete cue point
   */
  router.delete(
    "/cuepoints/:assetId/:cuePointId",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      param("cuePointId").notEmpty().withMessage("Cue point ID is required"),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.deleteCuePoint(
          req.params.assetId,
          req.params.cuePointId,
        );
        res.json(result);
      } catch (error) {
        logger.error("Cue point deletion failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /:assetId/decision - Get server-guided ad decision
   */
  router.get(
    "/:assetId/decision",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      ...userContextValidators,
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.getAdDecision(
          req.params.assetId,
          buildUserContext(req),
        );
        res.json(result);
      } catch (error) {
        logger.error("Ad decision fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * POST /:assetId/events - Record server-guided ad telemetry
   */
  router.post(
    "/:assetId/events",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      body("decisionId").notEmpty().withMessage("Decision ID is required"),
      body("adBreakId").notEmpty().withMessage("Ad break ID is required"),
      body("eventType").isIn([
        "requested",
        "impression",
        "first-quartile",
        "midpoint",
        "third-quartile",
        "complete",
        "error",
      ]),
      body("playbackSessionId").optional().isString(),
      body("metadata").optional().isObject(),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.recordAdEvent(
          req.params.assetId,
          req.body,
        );
        res.status(201).json(result);
      } catch (error) {
        logger.error("Ad event recording failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /:assetId/manifest - Get ad-enabled manifest
   */
  router.get(
    "/:assetId/manifest",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      ...userContextValidators,
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.getAdEnabledManifest(
          req.params.assetId,
          buildUserContext(req),
        );

        if (result.adEnabled) {
          res.set("Content-Type", "application/vnd.apple.mpegurl");
          res.send(result.manifest);
        } else {
          res.json(result);
        }
      } catch (error) {
        logger.error("Ad manifest fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /:assetId/analytics - Get ad performance analytics
   */
  router.get(
    "/:assetId/analytics",
    [param("assetId").notEmpty().withMessage("Asset ID is required")],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await adMvpService.getAdAnalytics(req.params.assetId);
        res.json(result);
      } catch (error) {
        logger.error("Ad analytics fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}

module.exports = { setupMvpAdRoutes };
