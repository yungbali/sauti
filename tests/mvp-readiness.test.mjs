import fs from "node:fs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import mvpIndex from "../src/mvp-index.js";
import {
  getMvpReadiness,
  REQUIRED_PRODUCTION_VARIABLES,
} from "../src/config/mvp-readiness.config.js";

const { createMvpApp } = mvpIndex;

describe("MVP readiness checks", () => {
  it("warns instead of failing when local demo secrets are missing", () => {
    const readiness = getMvpReadiness({ env: { NODE_ENV: "development" } });

    expect(readiness.status).toBe("demo-ready");
    expect(readiness.mode).toBe("demo");
    expect(readiness.summary.warnings).toBe(
      REQUIRED_PRODUCTION_VARIABLES.length,
    );
  });

  it("fails production readiness when required MVP secrets are missing", () => {
    const readiness = getMvpReadiness({ env: { NODE_ENV: "production" } });

    expect(readiness.status).toBe("not-ready");
    expect(readiness.mode).toBe("production");
    expect(readiness.summary.failed).toBe(REQUIRED_PRODUCTION_VARIABLES.length);
  });

  it("exposes demo readiness warnings through the health endpoint", async () => {
    fs.mkdirSync("./storage", { recursive: true });
    const app = createMvpApp();

    const response = await request(app).get("/health/ready").expect(200);

    expect(response.body.status).toBe("demo-ready");
    expect(response.body.checks.environment).toBe("warn");
    expect(response.body.environment.summary.warnings).toBeGreaterThan(0);
  });
});
