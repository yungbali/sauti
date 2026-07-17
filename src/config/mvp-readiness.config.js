/**
 * MVP readiness configuration.
 * Centralizes the environment checks that separate local demo mode from a
 * partner-ready MVP deployment.
 */

const REQUIRED_PRODUCTION_VARIABLES = [
  {
    key: "MUX_TOKEN_ID",
    service: "mux",
    description: "Mux token ID for direct uploads, imports, and asset status",
  },
  {
    key: "MUX_TOKEN_SECRET",
    service: "mux",
    description:
      "Mux token secret for direct uploads, imports, and asset status",
  },
  {
    key: "MUX_WEBHOOK_SECRET",
    service: "mux",
    description:
      "Mux webhook signing secret for trusted asset lifecycle updates",
  },
  {
    key: "SUPABASE_URL",
    service: "database",
    description: "Supabase project URL for durable MVP persistence",
  },
  {
    key: "SUPABASE_ANON_KEY",
    service: "database",
    description: "Supabase anon key for read/write operations guarded by RLS",
  },
  {
    key: "JWT_SECRET",
    service: "auth",
    description: "JWT signing secret for partner/API authentication",
  },
];

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function getMvpReadiness(options = {}) {
  const env = options.env || process.env;
  const nodeEnv = env.NODE_ENV || "development";
  const enforceProduction =
    options.enforceProduction !== undefined
      ? options.enforceProduction
      : nodeEnv === "production" || isTruthy(env.ENFORCE_MVP_READINESS);

  const checks = REQUIRED_PRODUCTION_VARIABLES.map((requirement) => {
    const configured = Boolean(env[requirement.key]);
    return {
      ...requirement,
      status: configured ? "pass" : enforceProduction ? "fail" : "warn",
      configured,
    };
  });

  const failed = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");

  return {
    status:
      failed.length > 0
        ? "not-ready"
        : warnings.length > 0
          ? "demo-ready"
          : "ready",
    mode: enforceProduction ? "production" : "demo",
    nodeEnv,
    enforceProduction,
    checks,
    summary: {
      total: checks.length,
      passed: checks.filter((check) => check.status === "pass").length,
      warnings: warnings.length,
      failed: failed.length,
    },
  };
}

function assertMvpReadiness(options = {}) {
  const readiness = getMvpReadiness(options);

  if (readiness.summary.failed > 0) {
    const missing = readiness.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.key)
      .join(", ");
    const error = new Error(
      `MVP production readiness failed. Missing: ${missing}`,
    );
    error.readiness = readiness;
    throw error;
  }

  return readiness;
}

module.exports = {
  REQUIRED_PRODUCTION_VARIABLES,
  getMvpReadiness,
  assertMvpReadiness,
};
