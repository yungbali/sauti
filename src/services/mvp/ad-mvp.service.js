/**
 * MVP Ad Service - Server-guided ad decisioning and monetization
 * Focus: Cue points, manifest guidance, basic targeting, and ad telemetry
 */
const { logger } = require("../../common/logger");

class AdMvpService {
  constructor() {
    this.cuePoints = new Map(); // In-memory storage for MVP (replace with DB)
    this.adDecisions = new Map(); // In-memory decision ledger for MVP (replace with DB)
    this.adEvents = new Map(); // In-memory ad telemetry for MVP (replace with DB)
    this.adProviders = {
      africa: {
        name: "African Ad Network",
        regions: ["KE", "NG", "ZA", "GH"],
        formats: ["video", "banner"],
        targeting: ["country", "language", "device", "connection"],
      },
    };

    logger.info("MVP Ad Service initialized");
  }

  /**
   * Create ad cue point for an asset
   */
  async createCuePoint(assetId, cuePointData) {
    try {
      logger.info("Creating ad cue point (MVP)", { assetId, cuePointData });

      if (!assetId) {
        throw new Error("Asset ID is required");
      }

      // Validate cue point data
      this._validateCuePoint(cuePointData);

      const cuePointId = `cue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const cuePoint = {
        id: cuePointId,
        assetId,
        type: cuePointData.type, // pre-roll, mid-roll, post-roll
        timeOffset: Number(cuePointData.timeOffset || 0),
        duration: Number(cuePointData.duration || 30),
        adBreakId: cuePointData.adBreakId || `break_${cuePointId}`,
        targeting: cuePointData.targeting || {},
        metadata: cuePointData.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store cue point (in memory for MVP)
      if (!this.cuePoints.has(assetId)) {
        this.cuePoints.set(assetId, []);
      }
      this.cuePoints.get(assetId).push(cuePoint);

      logger.info("Ad cue point created", { cuePointId, assetId });
      return cuePoint;
    } catch (error) {
      logger.error("Error creating cue point:", error);
      throw error;
    }
  }

  /**
   * Get all cue points for an asset
   */
  async getCuePoints(assetId) {
    try {
      logger.info("Getting cue points (MVP)", { assetId });

      const cuePoints = this.cuePoints.get(assetId) || [];

      return {
        assetId,
        cuePoints,
        count: cuePoints.length,
        totalAdDuration: cuePoints.reduce((sum, cue) => sum + cue.duration, 0),
      };
    } catch (error) {
      logger.error("Error getting cue points:", error);
      throw error;
    }
  }

  /**
   * Update cue point
   */
  async updateCuePoint(assetId, cuePointId, updateData) {
    try {
      logger.info("Updating cue point (MVP)", { assetId, cuePointId });

      const assetCuePoints = this.cuePoints.get(assetId) || [];
      const cuePointIndex = assetCuePoints.findIndex(
        (cue) => cue.id === cuePointId,
      );

      if (cuePointIndex === -1) {
        throw new Error("Cue point not found");
      }

      // Validate update data
      if (updateData.type) this._validateCuePointType(updateData.type);

      // Update cue point
      const updatedCuePoint = {
        ...assetCuePoints[cuePointIndex],
        ...updateData,
        ...(updateData.timeOffset !== undefined && {
          timeOffset: Number(updateData.timeOffset),
        }),
        ...(updateData.duration !== undefined && {
          duration: Number(updateData.duration),
        }),
        updatedAt: new Date().toISOString(),
      };

      assetCuePoints[cuePointIndex] = updatedCuePoint;

      logger.info("Cue point updated", { cuePointId, assetId });
      return updatedCuePoint;
    } catch (error) {
      logger.error("Error updating cue point:", error);
      throw error;
    }
  }

  /**
   * Delete cue point
   */
  async deleteCuePoint(assetId, cuePointId) {
    try {
      logger.info("Deleting cue point (MVP)", { assetId, cuePointId });

      const assetCuePoints = this.cuePoints.get(assetId) || [];
      const cuePointIndex = assetCuePoints.findIndex(
        (cue) => cue.id === cuePointId,
      );

      if (cuePointIndex === -1) {
        throw new Error("Cue point not found");
      }

      const deletedCuePoint = assetCuePoints.splice(cuePointIndex, 1)[0];

      logger.info("Cue point deleted", { cuePointId, assetId });
      return { deleted: true, cuePoint: deletedCuePoint };
    } catch (error) {
      logger.error("Error deleting cue point:", error);
      throw error;
    }
  }

  /**
   * Get a server-guided ad decision for an asset and viewer context.
   */
  async getAdDecision(assetId, userContext = {}) {
    try {
      logger.info("Getting server-guided ad decision (MVP)", {
        assetId,
        userContext,
      });

      if (!assetId) {
        throw new Error("Asset ID is required");
      }

      const { cuePoints } = await this.getCuePoints(assetId);
      const targeting = this._getTargetingInfo(userContext);
      const eligibleCuePoints = cuePoints.filter((cue) =>
        this._cueMatchesContext(cue, targeting),
      );
      const networkProfile = this._getAdNetworkProfile(targeting);
      const decisionId = `ad_decision_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const adBreaks = eligibleCuePoints.map((cue) =>
        this._buildAdBreak(cue, targeting, networkProfile),
      );
      const decision = {
        decisionId,
        assetId,
        enabled: adBreaks.length > 0,
        deliveryMode: "server-guided-manifest",
        provider: this.adProviders.africa.name,
        targeting,
        networkProfile,
        adBreaks,
        manifestDirectives: adBreaks.map((adBreak) => ({
          adBreakId: adBreak.adBreakId,
          cueType: adBreak.type,
          cueOut: `#EXT-X-CUE-OUT:DURATION=${adBreak.duration}`,
          cueIn: "#EXT-X-CUE-IN",
          decisionTag: `#EXT-X-SAUTI-AD-DECISION:ID=${decisionId},BREAK=${adBreak.adBreakId},MODE=server-guided`,
        })),
        createdAt: new Date().toISOString(),
      };

      this.adDecisions.set(decisionId, decision);
      logger.info("Server-guided ad decision created", {
        decisionId,
        assetId,
        adBreakCount: adBreaks.length,
      });

      return decision;
    } catch (error) {
      logger.error("Error getting ad decision:", error);
      throw error;
    }
  }

  /**
   * Record ad delivery telemetry from player or server callbacks.
   */
  async recordAdEvent(assetId, eventData) {
    try {
      logger.info("Recording ad event (MVP)", { assetId, eventData });

      if (!assetId) {
        throw new Error("Asset ID is required");
      }
      this._validateAdEvent(eventData);

      const event = {
        id: `ad_event_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        assetId,
        decisionId: eventData.decisionId,
        adBreakId: eventData.adBreakId,
        eventType: eventData.eventType,
        playbackSessionId: eventData.playbackSessionId || null,
        metadata: eventData.metadata || {},
        createdAt: new Date().toISOString(),
      };

      if (!this.adEvents.has(assetId)) {
        this.adEvents.set(assetId, []);
      }
      this.adEvents.get(assetId).push(event);

      return event;
    } catch (error) {
      logger.error("Error recording ad event:", error);
      throw error;
    }
  }

  /**
   * Get ad-enabled manifest for an asset
   */
  async getAdEnabledManifest(assetId, userContext = {}) {
    try {
      logger.info("Getting ad-enabled manifest (MVP)", {
        assetId,
        userContext,
      });

      const decision = await this.getAdDecision(assetId, userContext);

      if (!decision.enabled) {
        return {
          assetId,
          manifest: null,
          adEnabled: false,
          decision,
          message: "No eligible ad cue points configured",
        };
      }

      // Generate personalized manifest
      const manifest = this._generateAdManifest(assetId, decision);

      return {
        assetId,
        manifest,
        adEnabled: true,
        decisionId: decision.decisionId,
        cuePointCount: decision.adBreaks.length,
        targeting: decision.targeting,
        decision,
      };
    } catch (error) {
      logger.error("Error getting ad-enabled manifest:", error);
      throw error;
    }
  }

  /**
   * Generate HLS manifest with server-guided ad markers
   */
  _generateAdManifest(assetId, decision) {
    const baseManifest = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-SAUTI-AD-SESSION:DECISION=${decision.decisionId},MODE=${decision.deliveryMode}
`;

    let manifest = baseManifest;

    // Add pre-roll ads
    const preRollBreaks = decision.adBreaks.filter(
      (adBreak) => adBreak.type === "pre-roll",
    );
    preRollBreaks.forEach((adBreak) => {
      manifest += this._renderAdBreakStart(adBreak, decision);
      manifest += "#EXT-X-CUE-IN\n";
    });

    // Add content segments with mid-roll opportunities
    const segmentDuration = 10; // seconds
    const totalSegments = 12; // 2 minutes of content

    for (let i = 0; i < totalSegments; i++) {
      const currentTime = i * segmentDuration;

      // Check for mid-roll cue points
      const midRollBreak = decision.adBreaks.find(
        (adBreak) =>
          adBreak.type === "mid-roll" &&
          Math.abs(adBreak.timeOffset - currentTime) < segmentDuration / 2,
      );

      if (midRollBreak) {
        manifest += this._renderAdBreakStart(midRollBreak, decision);
      }

      manifest += `#EXTINF:${segmentDuration}.0,\n`;
      manifest += `segment_${assetId}_${i.toString().padStart(3, "0")}.ts\n`;

      if (midRollBreak) {
        manifest += "#EXT-X-CUE-IN\n";
      }
    }

    // Add post-roll ads
    const postRollBreaks = decision.adBreaks.filter(
      (adBreak) => adBreak.type === "post-roll",
    );
    postRollBreaks.forEach((adBreak) => {
      manifest += this._renderAdBreakStart(adBreak, decision);
      manifest += "#EXT-X-CUE-IN\n";
    });

    manifest += "#EXT-X-ENDLIST\n";
    return manifest;
  }

  _renderAdBreakStart(adBreak, decision) {
    let manifest = `#EXT-X-SAUTI-AD-DECISION:ID=${decision.decisionId},BREAK=${adBreak.adBreakId},MODE=server-guided\n`;
    manifest += `#EXT-X-CUE-OUT:DURATION=${adBreak.duration}\n`;
    manifest += `#EXT-X-AD-BREAK-ID:${adBreak.adBreakId}\n`;
    manifest += `#EXT-X-ASSET:URI="${adBreak.creative.url}",DURATION=${adBreak.duration}\n`;
    manifest += `#EXT-X-AD-TARGETING:COUNTRY=${decision.targeting.country}\n`;
    manifest += `#EXT-X-AD-TARGETING:LANGUAGE=${decision.targeting.language}\n`;
    manifest += `#EXT-X-AD-TARGETING:DEVICE=${decision.targeting.deviceType}\n`;
    manifest += `#EXT-X-AD-TARGETING:CONNECTION=${decision.targeting.connectionType}\n`;
    return manifest;
  }

  _buildAdBreak(cue, targeting, networkProfile) {
    const duration = Math.min(cue.duration, networkProfile.maxAdDuration);
    const adBreakId = cue.adBreakId || `break_${cue.id}`;

    return {
      id: cue.id,
      adBreakId,
      type: cue.type,
      timeOffset: cue.timeOffset,
      duration,
      originalDuration: cue.duration,
      creative: {
        id: `creative_${adBreakId}`,
        type: "video/mp4",
        url: this._buildCreativeUrl(adBreakId, targeting, networkProfile),
        bitrate: networkProfile.maxAdBitrate,
        transcodeProfile: networkProfile.creativeProfile,
      },
      tracking: {
        impression: `/v1/ads/${cue.assetId}/events`,
        quartiles: [25, 50, 75, 100],
      },
      targeting: cue.targeting || {},
      decisionReason: networkProfile.reason,
    };
  }

  _buildCreativeUrl(adBreakId, targeting, networkProfile) {
    const params = new URLSearchParams({
      country: targeting.country,
      device: targeting.deviceType,
      connection: targeting.connectionType,
      profile: networkProfile.creativeProfile,
    });

    return `https://ads.sauti.example/${adBreakId}.mp4?${params.toString()}`;
  }

  _cueMatchesContext(cue, targeting) {
    const cueTargeting = cue.targeting || {};
    const checks = [
      ["country", targeting.country],
      ["language", targeting.language],
      ["deviceType", targeting.deviceType],
      ["connectionType", targeting.connectionType],
    ];

    return checks.every(([key, value]) => {
      if (!cueTargeting[key]) return true;
      const allowedValues = Array.isArray(cueTargeting[key])
        ? cueTargeting[key]
        : [cueTargeting[key]];
      return allowedValues.includes(value);
    });
  }

  _getAdNetworkProfile(targeting) {
    const isCellular =
      targeting.connectionType === "cellular" ||
      targeting.connectionType === "slow";
    const isMobile =
      targeting.deviceType === "mobile" || targeting.deviceType === "tablet";

    if (isCellular && isMobile) {
      return {
        creativeProfile: "low-overhead-mobile",
        maxAdDuration: 15,
        maxAdBitrate: 150000,
        prefetchSeconds: 2,
        reason:
          "mobile cellular profile prioritizes short low-bitrate ad creative",
      };
    }

    return {
      creativeProfile: "standard-adaptive",
      maxAdDuration: 30,
      maxAdBitrate: 800000,
      prefetchSeconds: 6,
      reason:
        "standard adaptive ad creative is safe for this connection profile",
    };
  }

  /**
   * Get targeting information for ads
   */
  _getTargetingInfo(userContext) {
    return {
      country: userContext.country || "unknown",
      language: userContext.language || "en",
      deviceType: userContext.deviceType || "mobile",
      connectionType: userContext.connectionType || "cellular",
      isp: userContext.isp || "unknown",
      targeting: "african-markets",
    };
  }

  /**
   * Validate cue point data
   */
  _validateCuePoint(cuePointData) {
    if (!cuePointData.type) {
      throw new Error("Cue point type is required");
    }

    this._validateCuePointType(cuePointData.type);

    if (
      cuePointData.timeOffset !== undefined &&
      Number(cuePointData.timeOffset) < 0
    ) {
      throw new Error("Time offset must be non-negative");
    }

    if (
      cuePointData.duration !== undefined &&
      Number(cuePointData.duration) <= 0
    ) {
      throw new Error("Duration must be positive");
    }
  }

  /**
   * Validate cue point type
   */
  _validateCuePointType(type) {
    const validTypes = ["pre-roll", "mid-roll", "post-roll"];
    if (!validTypes.includes(type)) {
      throw new Error(
        `Invalid cue point type. Must be one of: ${validTypes.join(", ")}`,
      );
    }
  }

  _validateAdEvent(eventData) {
    if (!eventData.decisionId) {
      throw new Error("Decision ID is required");
    }
    if (!eventData.adBreakId) {
      throw new Error("Ad break ID is required");
    }
    const validEventTypes = [
      "requested",
      "impression",
      "first-quartile",
      "midpoint",
      "third-quartile",
      "complete",
      "error",
    ];
    if (!validEventTypes.includes(eventData.eventType)) {
      throw new Error(
        `Invalid ad event type. Must be one of: ${validEventTypes.join(", ")}`,
      );
    }
  }

  /**
   * Get analytics for ad performance (basic MVP version)
   */
  async getAdAnalytics(assetId) {
    try {
      logger.info("Getting ad analytics (MVP)", { assetId });

      const { cuePoints } = await this.getCuePoints(assetId);
      const assetEvents = this.adEvents.get(assetId) || [];
      const decisions = Array.from(this.adDecisions.values()).filter(
        (decision) => decision.assetId === assetId,
      );

      // Mock analytics data with server-guided delivery metrics
      return {
        assetId,
        totalCuePoints: cuePoints.length,
        totalAdDuration: cuePoints.reduce((sum, cue) => sum + cue.duration, 0),
        totalDecisions: decisions.length,
        totalEvents: assetEvents.length,
        eventsByType: assetEvents.reduce((acc, event) => {
          acc[event.eventType] = (acc[event.eventType] || 0) + 1;
          return acc;
        }, {}),
        breakdown: {
          preRoll: cuePoints.filter((cue) => cue.type === "pre-roll").length,
          midRoll: cuePoints.filter((cue) => cue.type === "mid-roll").length,
          postRoll: cuePoints.filter((cue) => cue.type === "post-roll").length,
        },
        estimatedRevenue:
          assetEvents.filter((event) => event.eventType === "impression")
            .length * 0.05,
        targeting: {
          africanMarkets: true,
          mobileOptimized: true,
          deliveryMode: "server-guided-manifest",
        },
      };
    } catch (error) {
      logger.error("Error getting ad analytics:", error);
      throw error;
    }
  }

  /**
   * Test helper for resetting in-memory state.
   */
  reset() {
    this.cuePoints.clear();
    this.adDecisions.clear();
    this.adEvents.clear();
  }
}

// Export singleton instance
const adMvpService = new AdMvpService();
module.exports = adMvpService;
