import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import mvpIndex from "../src/mvp-index.js";
import adMvpService from "../src/services/mvp/ad-mvp.service.js";

const { createMvpApp } = mvpIndex;

describe("MVP server-guided ad decisioning", () => {
  let app;

  beforeEach(() => {
    adMvpService.reset();
    app = createMvpApp();
  });

  it("returns a low-overhead ad decision for Nigerian mobile cellular viewers", async () => {
    await request(app)
      .post("/v1/ads/cuepoints/decision-asset")
      .send({
        type: "pre-roll",
        duration: 30,
        targeting: {
          country: "NG",
          deviceType: "mobile",
          connectionType: "cellular",
        },
      })
      .expect(201);

    const response = await request(app)
      .get("/v1/ads/decision-asset/decision")
      .query({
        country: "NG",
        isp: "mtn",
        deviceType: "mobile",
        connectionType: "cellular",
      })
      .expect(200);

    expect(response.body.enabled).toBe(true);
    expect(response.body.deliveryMode).toBe("server-guided-manifest");
    expect(response.body.networkProfile.creativeProfile).toBe(
      "low-overhead-mobile",
    );
    expect(response.body.adBreaks).toHaveLength(1);
    expect(response.body.adBreaks[0].duration).toBe(15);
    expect(response.body.adBreaks[0].creative.bitrate).toBe(150000);
    expect(response.body.adBreaks[0].creative.url).toContain("country=NG");
  });

  it("embeds server-guided decision tags in the HLS manifest", async () => {
    await request(app)
      .post("/v1/ads/cuepoints/manifest-asset")
      .send({
        type: "mid-roll",
        timeOffset: 30,
        duration: 15,
        targeting: { country: "NG" },
      })
      .expect(201);

    const response = await request(app)
      .get("/v1/ads/manifest-asset/manifest")
      .query({
        country: "NG",
        language: "en",
        deviceType: "mobile",
        connectionType: "cellular",
      })
      .expect("Content-Type", /application\/vnd\.apple\.mpegurl/)
      .expect(200);

    expect(response.text).toContain("#EXT-X-SAUTI-AD-SESSION:");
    expect(response.text).toContain("#EXT-X-SAUTI-AD-DECISION:");
    expect(response.text).toContain(
      '#EXT-X-ASSET:URI="https://ads.sauti.example/',
    );
    expect(response.text).toContain("#EXT-X-AD-TARGETING:COUNTRY=NG");
  });

  it("records ad telemetry against a server-guided decision", async () => {
    await request(app)
      .post("/v1/ads/cuepoints/telemetry-asset")
      .send({ type: "pre-roll", duration: 10 })
      .expect(201);

    const decisionResponse = await request(app)
      .get("/v1/ads/telemetry-asset/decision")
      .query({
        country: "NG",
        deviceType: "mobile",
        connectionType: "cellular",
      })
      .expect(200);

    const adBreak = decisionResponse.body.adBreaks[0];

    await request(app)
      .post("/v1/ads/telemetry-asset/events")
      .send({
        decisionId: decisionResponse.body.decisionId,
        adBreakId: adBreak.adBreakId,
        eventType: "impression",
        playbackSessionId: "session_test",
      })
      .expect(201);

    const analyticsResponse = await request(app)
      .get("/v1/ads/telemetry-asset/analytics")
      .expect(200);

    expect(analyticsResponse.body.totalDecisions).toBe(1);
    expect(analyticsResponse.body.totalEvents).toBe(1);
    expect(analyticsResponse.body.eventsByType.impression).toBe(1);
    expect(analyticsResponse.body.estimatedRevenue).toBe(0.05);
  });
});
