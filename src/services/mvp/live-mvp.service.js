/**
 * MVP live streaming service.
 *
 * Mux owns the live ingest and playback infrastructure. Sauti creates a
 * broadcast, gives its producer the RTMP details once, and exposes a safe
 * viewer-facing playback URL for the live page.
 */
const Mux = require("@mux/mux-node");

const RTMP_INGEST_URL = "rtmp://global-live.mux.com:5222/app";

class LiveMvpService {
  constructor({ env = process.env, muxFactory = Mux } = {}) {
    this.env = env;
    this.muxFactory = muxFactory;
    this.client = null;
  }

  getClient() {
    if (this.client) return this.client;

    if (!this.env.MUX_TOKEN_ID || !this.env.MUX_TOKEN_SECRET) {
      const error = new Error(
        "Live streaming is not configured. Set MUX_TOKEN_ID and MUX_TOKEN_SECRET.",
      );
      error.status = 503;
      throw error;
    }

    this.client = new this.muxFactory({
      tokenId: this.env.MUX_TOKEN_ID,
      tokenSecret: this.env.MUX_TOKEN_SECRET,
    });
    return this.client;
  }

  async createBroadcast({ title, latencyMode = "reduced", test = false } = {}) {
    const liveStream = await this.getClient().video.liveStreams.create({
      playback_policies: ["public"],
      new_asset_settings: { playback_policies: ["public"] },
      latency_mode: latencyMode,
      reconnect_window: 30,
      meta: title ? { title } : undefined,
      test,
    });

    return {
      ...this.toViewerBroadcast(liveStream),
      ingest: {
        protocol: "rtmp",
        url: RTMP_INGEST_URL,
        streamKey: liveStream.stream_key,
      },
    };
  }

  async getBroadcast(liveStreamId) {
    const liveStream =
      await this.getClient().video.liveStreams.retrieve(liveStreamId);
    return this.toViewerBroadcast(liveStream);
  }

  async endBroadcast(liveStreamId) {
    await this.getClient().video.liveStreams.complete(liveStreamId);
    return { id: liveStreamId, status: "ending" };
  }

  toViewerBroadcast(liveStream) {
    const playbackId = liveStream.playback_ids?.find(
      (playback) => playback.policy === "public",
    )?.id;

    return {
      id: liveStream.id,
      status: liveStream.status,
      title: liveStream.meta?.title || null,
      latencyMode: liveStream.latency_mode,
      activeAssetId: liveStream.active_asset_id || null,
      playback: playbackId
        ? {
            playbackId,
            hlsUrl: `https://stream.mux.com/${playbackId}.m3u8`,
          }
        : null,
    };
  }
}

module.exports = { LiveMvpService, RTMP_INGEST_URL };
