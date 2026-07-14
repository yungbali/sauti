/**
 * MVP Streaming Routes - African-optimized content delivery
 */
const express = require("express");
const { param, query, validationResult } = require("express-validator");
const { logger } = require("../../common/logger");
const streamingMvpService = require("../../services/mvp/streaming-mvp.service");

function setupMvpStreamingRoutes() {
  const router = express.Router();

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
   * GET /:assetId - Get optimized streaming URLs
   */
  router.get(
    "/:assetId",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      query("country")
        .optional()
        .isLength({ min: 2, max: 2 })
        .withMessage("Country must be 2-letter ISO code"),
      query("deviceType")
        .optional()
        .isIn(["mobile", "tablet", "desktop", "tv"]),
      query("connectionType")
        .optional()
        .isIn(["cellular", "wifi", "wired", "slow"]),
      query("isp").optional().isString().trim().isLength({ min: 2, max: 32 }),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const options = {
          ip: req.ip,
          country: req.query.country,
          isp: req.query.isp,
          deviceType: req.query.deviceType,
          connectionType: req.query.connectionType,
        };

        const result = await streamingMvpService.getStreamingUrls(
          req.params.assetId,
          options,
        );
        res.json(result);
      } catch (error) {
        logger.error("Streaming URLs fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /:assetId/manifest - Get HLS manifest with ads
   */
  router.get(
    "/:assetId/manifest",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      query("ads")
        .optional()
        .isBoolean()
        .withMessage("Ads parameter must be boolean"),
      query("country")
        .optional()
        .isLength({ min: 2, max: 2 })
        .withMessage("Country must be 2-letter ISO code"),
      query("language")
        .optional()
        .isLength({ min: 2, max: 8 })
        .withMessage("Language must be a locale code"),
      query("deviceType")
        .optional()
        .isIn(["mobile", "tablet", "desktop", "tv"]),
      query("connectionType")
        .optional()
        .isIn(["cellular", "wifi", "wired", "slow"]),
      query("isp").optional().isString().trim().isLength({ min: 2, max: 32 }),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const assetId = req.params.assetId;
        const includeAds = req.query.ads !== "false"; // Default to true

        if (includeAds) {
          // Get ad-enabled manifest
          const adMvpService = require("../../services/mvp/ad-mvp.service");
          const userContext = {
            country: req.query.country,
            language: req.query.language || "en",
            deviceType: req.query.deviceType || "mobile",
            connectionType: req.query.connectionType || "cellular",
            isp: req.query.isp || "auto",
          };

          const result = await adMvpService.getAdEnabledManifest(
            assetId,
            userContext,
          );

          if (result.adEnabled) {
            res.set("Content-Type", "application/vnd.apple.mpegurl");
            res.send(result.manifest);
          } else {
            // Fall back to regular manifest
            const streamingResult = await streamingMvpService.getStreamingUrls(
              assetId,
              userContext,
            );
            res.redirect(streamingResult.formats.hls.url);
          }
        } else {
          // Regular manifest without ads
          const result = await streamingMvpService.getStreamingUrls(assetId, {
            country: req.query.country,
            isp: req.query.isp,
            deviceType: req.query.deviceType,
            connectionType: req.query.connectionType,
          });
          res.redirect(result.formats.hls.url);
        }
      } catch (error) {
        logger.error("Manifest fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  /**
   * GET /:assetId/qualities - Get available quality options
   */
  router.get(
    "/:assetId/qualities",
    [
      param("assetId").notEmpty().withMessage("Asset ID is required"),
      query("connectionType")
        .optional()
        .isIn(["cellular", "wifi", "wired", "slow"]),
    ],
    handleValidationErrors,
    async (req, res) => {
      try {
        const result = await streamingMvpService.getStreamingUrls(
          req.params.assetId,
          {
            connectionType: req.query.connectionType,
          },
        );

        res.json({
          assetId: req.params.assetId,
          qualities: result.qualities,
          recommendedQuality:
            result.qualities.find((q) => q.recommended)?.label || "Auto",
        });
      } catch (error) {
        logger.error("Qualities fetch failed:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  return router;
}

module.exports = { setupMvpStreamingRoutes };
