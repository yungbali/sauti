/**
 * Production Ingest Service
 * Real media ingestion service using Mux for African markets
 */

const { logger } = require('../../common/logger');
const { getMuxClient, isConfigured } = require('../../config/mux.config');
const { getAdminClient } = require('../../config/supabase.config');

class IngestService {
    constructor() {
        this.initialized = false;
        this.mux = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            this.mux = await getMuxClient();
            this.supabase = await getAdminClient();
            
            logger.info('Production Ingest Service initialized', { 
                muxConfigured: await isConfigured(),
                supabaseConfigured: !!this.supabase 
            });
            this.initialized = true;
        } catch (error) {
            logger.error('Failed to initialize Production Ingest Service:', error);
        }
    }

    /**
     * Create a direct upload URL for media files
     * @param {Object} options - Upload options
     * @param {string} options.corsOrigin - CORS origin for upload
     * @param {string} options.contentType - Content type (video, audio, etc.)
     * @returns {Promise<Object>} Upload details
     */
    async createDirectUpload(options = {}) {
        const { corsOrigin, contentType = 'video' } = options;
        
        logger.info('Creating direct upload URL', { corsOrigin, contentType });

        if (!this.initialized) {
            await this.init();
        }

        if (!this.mux) {
            throw new Error('Mux not configured. Please check AWS Secrets Manager or environment variables for MUX_TOKEN_ID and MUX_TOKEN_SECRET.');
        }

        try {
            const upload = await this.mux.video.uploads.create({
                cors_origin: corsOrigin,
                new_asset_settings: {
                    playback_policy: ['public'],
                    video_quality: 'basic', // Optimized for African bandwidth
                    encoding_tier: 'baseline', // Faster processing
                    // African market optimizations
                    max_resolution_tier: '1080p', // Reasonable for mobile networks
                    normalize_audio: true, // Better for mobile devices
                    mp4_support: 'standard' // Ensure MP4 fallback
                }
            });

            // Store upload info in Supabase if available
            if (this.supabase) {
                try {
                    await this.supabase
                        .from('uploads')
                        .insert({
                            upload_id: upload.id,
                            status: 'created',
                            cors_origin: corsOrigin,
                            content_type: contentType,
                            created_at: new Date().toISOString()
                        });
                } catch (dbError) {
                    logger.warn('Failed to store upload in database:', dbError);
                }
            }

            return {
                uploadId: upload.id,
                url: upload.url,
                corsOrigin,
                status: 'ready',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                metadata: upload.new_asset_settings || {},
                contentType,
                playbackPolicy: 'public'
            };
        } catch (error) {
            logger.error('Failed to create direct upload:', error);
            throw new Error(`Failed to create upload URL: ${error.message}`);
        }
    }

    /**
     * Import media from external URL
     * @param {Object} options - Import options
     * @param {string} options.url - URL to import from
     * @param {Object} options.metadata - Optional metadata
     * @returns {Promise<Object>} Asset details
     */
    async importFromUrl(options = {}) {
        const { url, metadata = {} } = options;
        
        logger.info('Importing media from URL', { url, metadata });

        if (!this.mux) {
            throw new Error('Mux not configured. Please add MUX_TOKEN_ID and MUX_TOKEN_SECRET to environment variables.');
        }

        try {
            const asset = await this.mux.video.assets.create({
                input: [{ url }],
                playback_policy: ['public'],
                video_quality: 'basic', // Optimized for African markets
                encoding_tier: 'baseline',
                // African market optimizations
                max_resolution_tier: '1080p',
                normalize_audio: true,
                mp4_support: 'standard',
                passthrough: JSON.stringify(metadata) // Store custom metadata
            });

            // Store asset info in Supabase if available
            if (this.supabase) {
                try {
                    await this.supabase
                        .from('assets')
                        .insert({
                            asset_id: asset.id,
                            status: asset.status,
                            input_url: url,
                            metadata,
                            created_at: new Date().toISOString()
                        });
                } catch (dbError) {
                    logger.warn('Failed to store asset in database:', dbError);
                }
            }

            return {
                assetId: asset.id,
                status: asset.status,
                inputUrl: url,
                metadata,
                playbackPolicy: 'public',
                createdAt: new Date().toISOString()
            };
        } catch (error) {
            logger.error('Failed to import from URL:', error);
            throw new Error(`Failed to import media: ${error.message}`);
        }
    }

    /**
     * Get the status of an upload/import job
     * @param {string} jobId - Job ID to check
     * @returns {Promise<Object>} Job status
     */
    async getJobStatus(jobId) {
        logger.info('Getting job status', { jobId });

        if (!this.mux) {
            throw new Error('Mux not configured. Please add MUX_TOKEN_ID and MUX_TOKEN_SECRET to environment variables.');
        }

        try {
            let status = 'processing';
            let assetId = null;
            let playbackId = null;

            // Check if it's an upload ID or asset ID
            if (jobId.startsWith('upload_')) {
                const upload = await this.mux.video.uploads.retrieve(jobId);
                if (upload.asset_id) {
                    assetId = upload.asset_id;
                    const asset = await this.mux.video.assets.retrieve(assetId);
                    status = asset.status;
                    if (asset.playback_ids && asset.playback_ids.length > 0) {
                        playbackId = asset.playback_ids[0].id;
                    }
                }
            } else if (jobId.startsWith('asset_')) {
                const asset = await this.mux.video.assets.retrieve(jobId);
                assetId = asset.id;
                status = asset.status;
                if (asset.playback_ids && asset.playback_ids.length > 0) {
                    playbackId = asset.playback_ids[0].id;
                }
            }

            // Update status in Supabase if available
            if (this.supabase && assetId) {
                try {
                    await this.supabase
                        .from('assets')
                        .update({ 
                            status,
                            playback_id: playbackId,
                            updated_at: new Date().toISOString()
                        })
                        .eq('asset_id', assetId);
                } catch (dbError) {
                    logger.warn('Failed to update asset status in database:', dbError);
                }
            }

            return {
                jobId,
                status,
                progress: status === 'ready' ? 100 : status === 'preparing' ? 25 : 50,
                assetId,
                playbackId,
                completedAt: status === 'ready' ? new Date().toISOString() : null
            };
        } catch (error) {
            logger.error('Failed to get job status:', error);
            throw new Error(`Failed to get job status: ${error.message}`);
        }
    }

    /**
     * Delete an asset
     * @param {string} assetId - Asset ID to delete
     * @returns {Promise<boolean>} Success status
     */
    async deleteAsset(assetId) {
        logger.info('Deleting asset', { assetId });

        if (!this.mux) {
            throw new Error('Mux not configured.');
        }

        try {
            await this.mux.video.assets.delete(assetId);

            // Update database if available
            if (this.supabase) {
                try {
                    await this.supabase
                        .from('assets')
                        .update({ 
                            status: 'deleted',
                            deleted_at: new Date().toISOString()
                        })
                        .eq('asset_id', assetId);
                } catch (dbError) {
                    logger.warn('Failed to update asset deletion in database:', dbError);
                }
            }

            return true;
        } catch (error) {
            logger.error('Failed to delete asset:', error);
            throw new Error(`Failed to delete asset: ${error.message}`);
        }
    }
}

// Singleton instance
const ingestService = new IngestService();
module.exports = ingestService;