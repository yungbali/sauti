/**
 * Supabase Configuration with AWS Secrets Manager
 * Handles Supabase client initialization and configuration
 */

const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../common/logger');
const { getSupabaseCredentials } = require('./aws-secrets.config');

class SupabaseConfig {
    constructor() {
        this.client = null;
        this.adminClient = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Get credentials from AWS Secrets Manager or environment variables
            const credentials = await getSupabaseCredentials();
            const { url, anonKey, serviceRoleKey } = credentials;

            if (!url || !anonKey) {
                logger.warn('Supabase credentials not found in AWS Secrets Manager or environment variables. Database features will be disabled.');
                return;
            }

            // Client for user-facing operations (respects RLS)
            this.client = createClient(url, anonKey);
            
            // Admin client for backend operations (bypasses RLS)
            if (serviceRoleKey) {
                this.adminClient = createClient(url, serviceRoleKey);
            }
            
            logger.info('Supabase client initialized successfully', {
                source: url.includes('supabase.co') ? 'aws-secrets-manager' : 'environment'
            });
            
            this.initialized = true;
        } catch (error) {
            logger.error('Failed to initialize Supabase client:', error);
        }
    }

    async getClient() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.client;
    }

    async getAdminClient() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.adminClient || this.client;
    }

    async isConfigured() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.client !== null;
    }
}

// Singleton instance
const supabaseConfig = new SupabaseConfig();

module.exports = {
    getClient: async () => await supabaseConfig.getClient(),
    getAdminClient: async () => await supabaseConfig.getAdminClient(),
    isConfigured: async () => await supabaseConfig.isConfigured()
};