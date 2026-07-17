import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { LiveMvpService } from "../src/services/mvp/live-mvp.service.js";
import { setupMvpLiveRoutes } from "../src/api-gateway/routes/mvp-live.routes.js";
import express from "express";

describe("MVP live streaming", () => {
  it("creates a Mux broadcast and only returns the stream key to the producer", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "live_123",
      status: "idle",
      latency_mode: "reduced",
      stream_key: "private-stream-key",
      playback_ids: [{ id: "public-playback", policy: "public" }],
      meta: { title: "Town hall" },
    });
    const muxFactory = vi.fn(() => ({ video: { liveStreams: { create } } }));
    const service = new LiveMvpService({
      env: { MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret" },
      muxFactory,
    });

    const broadcast = await service.createBroadcast({ title: "Town hall" });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        playback_policies: ["public"],
        latency_mode: "reduced",
        reconnect_window: 30,
      }),
    );
    expect(broadcast.ingest.streamKey).toBe("private-stream-key");
    expect(broadcast.playback.hlsUrl).toBe(
      "https://stream.mux.com/public-playback.m3u8",
    );
  });

  it("requires producer access for broadcast creation in production", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      "/v1/live",
      setupMvpLiveRoutes({
        env: { NODE_ENV: "production", LIVE_ADMIN_TOKEN: "producer-secret" },
        liveService: { createBroadcast: vi.fn() },
      }),
    );

    await request(app)
      .post("/v1/live")
      .send({ title: "Town hall" })
      .expect(401);
  });

  it("exposes a viewer-safe broadcast response", async () => {
    const app = express();
    app.use(
      "/v1/live",
      setupMvpLiveRoutes({
        liveService: {
          getBroadcast: vi.fn().mockResolvedValue({
            id: "live_123",
            status: "active",
            playback: { hlsUrl: "https://stream.mux.com/public-playback.m3u8" },
          }),
        },
      }),
    );

    const response = await request(app).get("/v1/live/live_123").expect(200);
    expect(response.body).not.toHaveProperty("streamKey");
    expect(response.body.playback.hlsUrl).toContain("stream.mux.com");
  });
});
