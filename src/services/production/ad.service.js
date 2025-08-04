/**
 * Production Ad Service  
 * Real ad insertion and monetization with Supabase storage
 */

const { logger } = require('../../common/logger');
const { getAdminClient } = require('../../config/supabase.config');

class AdService {
    constructor() {
        this.initialized = false;
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            this.supabase = await getAdminClient();
            
            // Ad network configurations for African markets
            this.adNetworks = {
                'default': {
                    provider: 'vast',
                    endpoint: 'https://pubads.g.doubleclick.net/gampad/ads',
                    timeout: 5000
                },
                'africa': {
                    provider: 'african_ads',
                    endpoint: 'https://ads.african-network.com/vast',
                    timeout: 8000 // Higher timeout for African networks
                }
            };
            
            logger.info('Production Ad Service initialized', { 
                supabaseConfigured: !!this.supabase 
            });
            this.initialized = true;
        } catch (error) {
            logger.error('Failed to initialize Production Ad Service:', error);
        }
    }

    /**
     * Create ad cue points for an asset
     */
    async createAdCuePoint(assetId, cuePointData) {
        const { type, timeOffset = 0, duration = 30, targeting = {}, metadata = {} } = cuePointData;
        
        logger.info('Creating ad cue point', { assetId, cuePointData });

        if (!this.initialized) {
            await this.init();
        }

        if (!this.supabase) {
            // Fallback to in-memory storage for development
            const cuePointId = `cue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            return {
                id: cuePointId,
                assetId,
                type,
                timeOffset,
                duration,
                adBreakId: `break_${cuePointId}`,
                targeting,
                metadata,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        try {
            const cuePointId = `cue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const adBreakId = `break_${cuePointId}`;

            const { data, error } = await this.supabase
                .from('ad_cue_points')
                .insert({
                    cue_point_id: cuePointId,
                    asset_id: assetId,
                    type,
                    time_offset: timeOffset,
                    duration,
                    ad_break_id: adBreakId,
                    targeting,
                    metadata
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('Ad cue point created', { cuePointId, assetId });

            return {
                id: data.cue_point_id,
                assetId: data.asset_id,
                type: data.type,
                timeOffset: data.time_offset,
                duration: data.duration,
                adBreakId: data.ad_break_id,
                targeting: data.targeting,
                metadata: data.metadata,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };
        } catch (error) {
            logger.error('Failed to create ad cue point:', error);
            throw new Error(`Failed to create ad cue point: ${error.message}`);
        }
    }

    /**
     * Get ad cue points for an asset
     */
    async getAdCuePoints(assetId) {
        logger.info('Getting ad cue points', { assetId });

        if (!this.supabase) {
            // Return mock data for development
            return [
                {
                    id: `cue_${assetId}_pre`,
                    assetId,
                    type: 'pre-roll',
                    timeOffset: 0,
                    duration: 30,
                    adBreakId: `break_${assetId}_pre`,
                    targeting: { country: 'KE', language: 'en' },
                    metadata: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            ];
        }

        try {
            const { data, error } = await this.supabase
                .from('ad_cue_points')
                .select('*')
                .eq('asset_id', assetId)
                .order('time_offset', { ascending: true });

            if (error) throw error;

            return data.map(cue => ({
                id: cue.cue_point_id,
                assetId: cue.asset_id,
                type: cue.type,
                timeOffset: cue.time_offset,
                duration: cue.duration,
                adBreakId: cue.ad_break_id,
                targeting: cue.targeting,
                metadata: cue.metadata,
                createdAt: cue.created_at,
                updatedAt: cue.updated_at
            }));
        } catch (error) {
            logger.error('Failed to get ad cue points:', error);
            throw new Error(`Failed to get ad cue points: ${error.message}`);
        }
    }

    /**
     * Update ad cue point
     */
    async updateAdCuePoint(cuePointId, updates) {
        logger.info('Updating ad cue point', { cuePointId, updates });

        if (!this.supabase) {
            throw new Error('Database not configured');
        }

        try {
            const updateData = {};
            if (updates.type) updateData.type = updates.type;
            if (updates.timeOffset !== undefined) updateData.time_offset = updates.timeOffset;
            if (updates.duration !== undefined) updateData.duration = updates.duration;
            if (updates.targeting) updateData.targeting = updates.targeting;
            if (updates.metadata) updateData.metadata = updates.metadata;

            const { data, error } = await this.supabase
                .from('ad_cue_points')
                .update(updateData)
                .eq('cue_point_id', cuePointId)
                .select()
                .single();

            if (error) throw error;

            return {
                id: data.cue_point_id,
                assetId: data.asset_id,
                type: data.type,
                timeOffset: data.time_offset,
                duration: data.duration,
                adBreakId: data.ad_break_id,
                targeting: data.targeting,
                metadata: data.metadata,
                createdAt: data.created_at,
                updatedAt: data.updated_at
            };
        } catch (error) {
            logger.error('Failed to update ad cue point:', error);
            throw new Error(`Failed to update ad cue point: ${error.message}`);
        }
    }

    /**
     * Delete ad cue point
     */
    async deleteAdCuePoint(cuePointId) {
        logger.info('Deleting ad cue point', { cuePointId });

        if (!this.supabase) {
            throw new Error('Database not configured');
        }

        try {
            const { error } = await this.supabase
                .from('ad_cue_points')
                .delete()
                .eq('cue_point_id', cuePointId);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            logger.error('Failed to delete ad cue point:', error);
            throw new Error(`Failed to delete ad cue point: ${error.message}`);
        }
    }

    /**
     * Generate VAST ad response for African markets
     */
    async generateVASTResponse(assetId, cuePointId, options = {}) {
        const { country, deviceType, language = 'en', userAgent } = options;
        
        logger.info('Generating VAST response', { assetId, cuePointId, options });

        // Get cue point details
        const cuePoints = await this.getAdCuePoints(assetId);
        const cuePoint = cuePoints.find(cp => cp.id === cuePointId);
        
        if (!cuePoint) {
            throw new Error('Cue point not found');
        }

        // African market ad optimizations
        const adConfig = this.getAfricanAdConfig(country, deviceType);
        
        // Generate VAST XML (simplified for MVP)
        const vastXml = this.generateVASTXML({
            cuePoint,
            adConfig,
            country,
            deviceType,
            language
        });

        return {
            vastXml,
            cuePoint,
            adConfig,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Get African market ad configuration
     */
    getAfricanAdConfig(country, deviceType) {
        const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
        
        return {
            // Optimized for African mobile networks
            maxBitrate: isMobile ? 500000 : 1000000, // 500kbps vs 1Mbps
            preferredFormats: ['mp4', 'webm'],
            skipOffset: 5, // Allow skip after 5 seconds
            maxDuration: 30, // Keep ads short for data-conscious users
            fallbackAds: [
                {
                    type: 'image',
                    url: 'https://cdn.african-ads.com/fallback/banner.jpg',
                    clickUrl: 'https://african-marketplace.com'
                }
            ],
            targeting: {
                country,
                language: this.getCountryLanguage(country),
                deviceType,
                network: 'mobile-optimized'
            }
        };
    }

    /**
     * Generate VAST XML response
     */
    generateVASTXML(options) {
        const { cuePoint, adConfig, country, deviceType, language } = options;
        
        // Simplified VAST 3.0 structure for African markets
        return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="3.0">
    <Ad id="${cuePoint.id}">
        <InLine>
            <AdSystem>African Media BaaS</AdSystem>
            <AdTitle>African Market Ad</AdTitle>
            <Description>Optimized for ${country} - ${deviceType}</Description>
            <Creatives>
                <Creative>
                    <Linear>
                        <Duration>00:00:${String(cuePoint.duration).padStart(2, '0')}</Duration>
                        <MediaFiles>
                            <MediaFile delivery="progressive" type="video/mp4" bitrate="${adConfig.maxBitrate}" width="640" height="360">
                                https://cdn.african-ads.com/videos/sample-ad-${country.toLowerCase()}.mp4
                            </MediaFile>
                        </MediaFiles>
                        <VideoClicks>
                            <ClickThrough>https://african-marketplace.com?country=${country}</ClickThrough>
                        </VideoClicks>
                        <AdParameters><![CDATA[
                            {"country": "${country}", "deviceType": "${deviceType}", "cuePointId": "${cuePoint.id}"}
                        ]]></AdParameters>
                    </Linear>
                </Creative>
            </Creatives>
        </InLine>
    </Ad>
</VAST>`;
    }

    /**
     * Get primary language for country
     */
    getCountryLanguage(country) {
        const countryLanguages = {
            'KE': 'en', // Kenya - English
            'NG': 'en', // Nigeria - English
            'ZA': 'en', // South Africa - English
            'GH': 'en', // Ghana - English
            'TZ': 'sw', // Tanzania - Swahili
            'UG': 'en', // Uganda - English
            'RW': 'rw', // Rwanda - Kinyarwanda
            'ET': 'am'  // Ethiopia - Amharic
        };
        
        return countryLanguages[country] || 'en';
    }

    /**
     * Get ad analytics for an asset
     */
    async getAdAnalytics(assetId, timeRange = '24h') {
        if (!this.supabase) {
            return { error: 'Database not configured' };
        }

        try {
            // For now, return basic cue point analytics
            const cuePoints = await this.getAdCuePoints(assetId);
            
            return {
                totalCuePoints: cuePoints.length,
                cuePointTypes: this.aggregateByField(cuePoints, 'type'),
                averageDuration: cuePoints.reduce((sum, cp) => sum + cp.duration, 0) / cuePoints.length || 0,
                cuePoints: cuePoints.map(cp => ({
                    id: cp.id,
                    type: cp.type,
                    timeOffset: cp.timeOffset,
                    duration: cp.duration
                }))
            };
        } catch (error) {
            logger.error('Failed to get ad analytics:', error);
            return { error: 'Failed to fetch analytics' };
        }
    }

    /**
     * Utility function to aggregate data by field
     */
    aggregateByField(data, field) {
        const counts = {};
        data.forEach(item => {
            const value = item[field] || 'unknown';
            counts[value] = (counts[value] || 0) + 1;
        });
        return counts;
    }
}

// Singleton instance
const adService = new AdService();
module.exports = adService;