/**
 * MVP Ad Service - Simplified Ad Insertion and Monetization
 * Focus: Cue points, manifest manipulation, basic targeting
 */
const { logger } = require('../../common/logger');

class AdMvpService {
  constructor() {
    this.cuePoints = new Map(); // In-memory storage for MVP (replace with DB)
    this.adProviders = {
      'africa': {
        name: 'African Ad Network',
        regions: ['KE', 'NG', 'ZA', 'GH'],
        formats: ['video', 'banner'],
        targeting: ['country', 'language', 'device']
      }
    };
    
    logger.info('MVP Ad Service initialized');
  }
  
  /**
   * Create ad cue point for an asset
   */
  async createCuePoint(assetId, cuePointData) {
    try {
      logger.info('Creating ad cue point (MVP)', { assetId, cuePointData });
      
      if (!assetId) {
        throw new Error('Asset ID is required');
      }
      
      // Validate cue point data
      this._validateCuePoint(cuePointData);
      
      const cuePointId = `cue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const cuePoint = {
        id: cuePointId,
        assetId,
        type: cuePointData.type, // pre-roll, mid-roll, post-roll
        timeOffset: cuePointData.timeOffset || 0,
        duration: cuePointData.duration || 30,
        adBreakId: cuePointData.adBreakId || `break_${cuePointId}`,
        targeting: cuePointData.targeting || {},
        metadata: cuePointData.metadata || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Store cue point (in memory for MVP)
      if (!this.cuePoints.has(assetId)) {
        this.cuePoints.set(assetId, []);
      }
      this.cuePoints.get(assetId).push(cuePoint);
      
      logger.info('Ad cue point created', { cuePointId, assetId });
      return cuePoint;
      
    } catch (error) {
      logger.error('Error creating cue point:', error);
      throw error;
    }
  }
  
  /**
   * Get all cue points for an asset
   */
  async getCuePoints(assetId) {
    try {
      logger.info('Getting cue points (MVP)', { assetId });
      
      const cuePoints = this.cuePoints.get(assetId) || [];
      
      return {
        assetId,
        cuePoints,
        count: cuePoints.length,
        totalAdDuration: cuePoints.reduce((sum, cue) => sum + cue.duration, 0)
      };
      
    } catch (error) {
      logger.error('Error getting cue points:', error);
      throw error;
    }
  }
  
  /**
   * Update cue point
   */
  async updateCuePoint(assetId, cuePointId, updateData) {
    try {
      logger.info('Updating cue point (MVP)', { assetId, cuePointId });
      
      const assetCuePoints = this.cuePoints.get(assetId) || [];
      const cuePointIndex = assetCuePoints.findIndex(cue => cue.id === cuePointId);
      
      if (cuePointIndex === -1) {
        throw new Error('Cue point not found');
      }
      
      // Validate update data
      if (updateData.type) this._validateCuePointType(updateData.type);
      
      // Update cue point
      const updatedCuePoint = {
        ...assetCuePoints[cuePointIndex],
        ...updateData,
        updatedAt: new Date().toISOString()
      };
      
      assetCuePoints[cuePointIndex] = updatedCuePoint;
      
      logger.info('Cue point updated', { cuePointId, assetId });
      return updatedCuePoint;
      
    } catch (error) {
      logger.error('Error updating cue point:', error);
      throw error;
    }
  }
  
  /**
   * Delete cue point
   */
  async deleteCuePoint(assetId, cuePointId) {
    try {
      logger.info('Deleting cue point (MVP)', { assetId, cuePointId });
      
      const assetCuePoints = this.cuePoints.get(assetId) || [];
      const cuePointIndex = assetCuePoints.findIndex(cue => cue.id === cuePointId);
      
      if (cuePointIndex === -1) {
        throw new Error('Cue point not found');
      }
      
      const deletedCuePoint = assetCuePoints.splice(cuePointIndex, 1)[0];
      
      logger.info('Cue point deleted', { cuePointId, assetId });
      return { deleted: true, cuePoint: deletedCuePoint };
      
    } catch (error) {
      logger.error('Error deleting cue point:', error);
      throw error;
    }
  }
  
  /**
   * Get ad-enabled manifest for an asset
   */
  async getAdEnabledManifest(assetId, userContext = {}) {
    try {
      logger.info('Getting ad-enabled manifest (MVP)', { assetId, userContext });
      
      const { cuePoints } = await this.getCuePoints(assetId);
      
      if (cuePoints.length === 0) {
        return {
          assetId,
          manifest: null,
          adEnabled: false,
          message: 'No ad cue points configured'
        };
      }
      
      // Generate personalized manifest
      const manifest = this._generateAdManifest(assetId, cuePoints, userContext);
      
      return {
        assetId,
        manifest,
        adEnabled: true,
        cuePointCount: cuePoints.length,
        targeting: this._getTargetingInfo(userContext)
      };
      
    } catch (error) {
      logger.error('Error getting ad-enabled manifest:', error);
      throw error;
    }
  }
  
  /**
   * Generate HLS manifest with ad markers
   */
  _generateAdManifest(assetId, cuePoints, userContext) {
    const baseManifest = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-TARGETDURATION:10
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-MEDIA-SEQUENCE:0
`;

    let manifest = baseManifest;
    
    // Add pre-roll ads
    const preRollCues = cuePoints.filter(cue => cue.type === 'pre-roll');
    preRollCues.forEach(cue => {
      manifest += `#EXT-X-CUE-OUT:DURATION=${cue.duration}\n`;
      manifest += `#EXT-X-AD-BREAK-ID:${cue.adBreakId}\n`;
      
      // Add African market targeting
      if (userContext.country) {
        manifest += `#EXT-X-AD-TARGETING:COUNTRY=${userContext.country}\n`;
      }
      if (userContext.language) {
        manifest += `#EXT-X-AD-TARGETING:LANGUAGE=${userContext.language}\n`;
      }
      if (userContext.deviceType) {
        manifest += `#EXT-X-AD-TARGETING:DEVICE=${userContext.deviceType}\n`;
      }
    });

    // Add content segments with mid-roll opportunities
    const segmentDuration = 10; // seconds
    const totalSegments = 12; // 2 minutes of content
    
    for (let i = 0; i < totalSegments; i++) {
      const currentTime = i * segmentDuration;
      
      // Check for mid-roll cue points
      const midRollCue = cuePoints.find(cue => 
        cue.type === 'mid-roll' && 
        Math.abs(cue.timeOffset - currentTime) < segmentDuration / 2
      );
      
      if (midRollCue) {
        manifest += `#EXT-X-CUE-OUT:DURATION=${midRollCue.duration}\n`;
        manifest += `#EXT-X-AD-BREAK-ID:${midRollCue.adBreakId}\n`;
        
        // Add targeting for mid-roll
        if (userContext.country) {
          manifest += `#EXT-X-AD-TARGETING:COUNTRY=${userContext.country}\n`;
        }
      }
      
      manifest += `#EXTINF:${segmentDuration}.0,\n`;
      manifest += `segment_${assetId}_${i.toString().padStart(3, '0')}.ts\n`;
      
      if (midRollCue) {
        manifest += `#EXT-X-CUE-IN\n`;
      }
    }

    // Add post-roll ads
    const postRollCues = cuePoints.filter(cue => cue.type === 'post-roll');
    postRollCues.forEach(cue => {
      manifest += `#EXT-X-CUE-OUT:DURATION=${cue.duration}\n`;
      manifest += `#EXT-X-AD-BREAK-ID:${cue.adBreakId}\n`;
    });

    manifest += `#EXT-X-ENDLIST\n`;
    return manifest;
  }
  
  /**
   * Get targeting information for ads
   */
  _getTargetingInfo(userContext) {
    return {
      country: userContext.country || 'unknown',
      language: userContext.language || 'en',
      deviceType: userContext.deviceType || 'mobile',
      connectionType: userContext.connectionType || 'cellular',
      targeting: 'african-markets'
    };
  }
  
  /**
   * Validate cue point data
   */
  _validateCuePoint(cuePointData) {
    if (!cuePointData.type) {
      throw new Error('Cue point type is required');
    }
    
    this._validateCuePointType(cuePointData.type);
    
    if (cuePointData.timeOffset !== undefined && cuePointData.timeOffset < 0) {
      throw new Error('Time offset must be non-negative');
    }
    
    if (cuePointData.duration !== undefined && cuePointData.duration <= 0) {
      throw new Error('Duration must be positive');
    }
  }
  
  /**
   * Validate cue point type
   */
  _validateCuePointType(type) {
    const validTypes = ['pre-roll', 'mid-roll', 'post-roll'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid cue point type. Must be one of: ${validTypes.join(', ')}`);
    }
  }
  
  /**
   * Get analytics for ad performance (basic MVP version)
   */
  async getAdAnalytics(assetId) {
    try {
      logger.info('Getting ad analytics (MVP)', { assetId });
      
      const { cuePoints } = await this.getCuePoints(assetId);
      
      // Mock analytics data
      return {
        assetId,
        totalCuePoints: cuePoints.length,
        totalAdDuration: cuePoints.reduce((sum, cue) => sum + cue.duration, 0),
        breakdown: {
          preRoll: cuePoints.filter(cue => cue.type === 'pre-roll').length,
          midRoll: cuePoints.filter(cue => cue.type === 'mid-roll').length,
          postRoll: cuePoints.filter(cue => cue.type === 'post-roll').length
        },
        estimatedRevenue: cuePoints.length * 0.05, // $0.05 per cue point (mock)
        targeting: {
          africanMarkets: true,
          mobileOptimized: true
        }
      };
      
    } catch (error) {
      logger.error('Error getting ad analytics:', error);
      throw error;
    }
  }
}

// Export singleton instance
const adMvpService = new AdMvpService();
module.exports = adMvpService;