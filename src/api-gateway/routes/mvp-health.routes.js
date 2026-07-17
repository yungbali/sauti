/**
 * MVP Health Routes - Simple health checks
 */
const express = require("express");
const { getMvpReadiness } = require("../../config/mvp-readiness.config");

function setupMvpHealthRoutes() {
  const router = express.Router();

  /**
   * GET / - Basic health check
   */
  router.get("/", (req, res) => {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: "1.0.0-mvp",
      services: {
        ingest: "operational",
        streaming: "operational",
        ads: "operational",
      },
      readiness: getMvpReadiness(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: "MB",
      },
    };

    res.json(health);
  });

  /**
   * GET /ready - Readiness check
   */
  router.get("/ready", (req, res) => {
    const envReadiness = getMvpReadiness();
    const checks = {
      storage: fs.existsSync("./storage") ? "pass" : "fail",
      memory:
        process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? "pass" : "warn", // 500MB
      environment:
        envReadiness.status === "not-ready"
          ? "fail"
          : envReadiness.status === "demo-ready"
            ? "warn"
            : "pass",
    };
    const ready = {
      status: Object.values(checks).includes("fail")
        ? "not-ready"
        : Object.values(checks).includes("warn")
          ? "demo-ready"
          : "ready",
      timestamp: new Date().toISOString(),
      checks,
      environment: envReadiness,
    };

    res.status(ready.status === "not-ready" ? 503 : 200).json(ready);
  });

  /**
   * GET /live - Liveness check
   */
  router.get("/live", (req, res) => {
    res.json({
      status: "alive",
      timestamp: new Date().toISOString(),
      pid: process.pid,
    });
  });

  return router;
}

// Import fs for readiness check
const fs = require("fs");

module.exports = { setupMvpHealthRoutes };
