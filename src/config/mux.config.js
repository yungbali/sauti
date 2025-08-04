/**
 * Mux Configuration with AWS Secrets Manager
 * Handles Mux client initialization and configuration
 */

const Mux = require('@mux/mux-node');
const { logger } = require('../common/logger');
const { getMuxCredentials } = require('./aws-secrets.config');

class MuxConfig {
    constructor() {
        this.mux = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Get credentials from AWS Secrets Manager or environment variables
            const credentials = await getMuxCredentials();
            const { tokenId, tokenSecret } = credentials;

            if (!tokenId || !tokenSecret) {
                logger.warn('Mux credentials not found in AWS Secrets Manager or environment variables. Running in mock mode.');
                return;
            }

            this.mux = new Mux({
                tokenId,
                tokenSecret
            });
            
            logger.info('Mux client initialized successfully', {
                source: credentials.tokenId.startsWith('env') ? 'environment' : 'aws-secrets-manager'
            });
            
            this.initialized = true;
        } catch (error) {
            logger.error('Failed to initialize Mux client:', error);
        }
    }

    async getMuxClient() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.mux;
    }

    async isConfigured() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.mux !== null;
    }
}

// Singleton instance
const muxConfig = new MuxConfig();

module.exports = {
    getMuxClient: async () => await muxConfig.getMuxClient(),
    isConfigured: async () => await muxConfig.isConfigured()
};