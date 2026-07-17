const express = require("express");
const { body, param, validationResult } = require("express-validator");
const { LiveMvpService } = require("../../services/mvp/live-mvp.service");
const { logger } = require("../../common/logger");

function setupMvpLiveRoutes({
  liveService = new LiveMvpService(),
  env = process.env,
} = {}) {
  const router = express.Router();
  const isProduction = env.NODE_ENV === "production";

  const validation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({ error: "Validation failed", details: errors.array() });
    }
    next();
  };

  const requireProducerAccess = (req, res, next) => {
    const configuredToken = env.LIVE_ADMIN_TOKEN;
    if (!configuredToken && !isProduction) return next();

    if (!configuredToken || req.get("x-live-admin-token") !== configuredToken) {
      return res.status(401).json({ error: "Producer access is required" });
    }
    next();
  };

  router.post(
    "/",
    requireProducerAccess,
    [
      body("title").optional().isString().trim().isLength({ min: 1, max: 120 }),
      body("latencyMode").optional().isIn(["low", "reduced", "standard"]),
      body("test").optional().isBoolean(),
    ],
    validation,
    async (req, res) => {
      try {
        const broadcast = await liveService.createBroadcast(req.body);
        res.status(201).json(broadcast);
      } catch (error) {
        logger.error("Live broadcast creation failed", {
          message: error.message,
        });
        res.status(error.status || 502).json({ error: error.message });
      }
    },
  );

  router.get(
    "/:liveStreamId",
    [param("liveStreamId").notEmpty()],
    validation,
    async (req, res) => {
      try {
        res.json(await liveService.getBroadcast(req.params.liveStreamId));
      } catch (error) {
        logger.error("Live broadcast fetch failed", { message: error.message });
        res.status(error.status || 502).json({ error: error.message });
      }
    },
  );

  router.post(
    "/:liveStreamId/end",
    requireProducerAccess,
    [param("liveStreamId").notEmpty()],
    validation,
    async (req, res) => {
      try {
        res.json(await liveService.endBroadcast(req.params.liveStreamId));
      } catch (error) {
        logger.error("Live broadcast completion failed", {
          message: error.message,
        });
        res.status(error.status || 502).json({ error: error.message });
      }
    },
  );

  return router;
}

module.exports = { setupMvpLiveRoutes };
