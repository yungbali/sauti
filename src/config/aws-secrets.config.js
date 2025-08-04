/**
 * AWS Secrets Manager Configuration
 * Securely retrieve credentials from AWS Secrets Manager
 */

const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { logger } = require('../common/logger');

class AWSSecretsConfig {
    constructor() {
        this.client = null;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.init();
    }

    init() {
        try {
            // Initialize AWS Secrets Manager client
            this.client = new SecretsManagerClient({
                region: process.env.AWS_REGION || 'us-east-1'
            });
            
            logger.info('AWS Secrets Manager client initialized', {
                region: process.env.AWS_REGION || 'us-east-1'
            });
        } catch (error) {
            logger.error('Failed to initialize AWS Secrets Manager client:', error);
        }
    }

    /**
     * Get secret from AWS Secrets Manager with caching
     */
    async getSecret(secretName) {
        // Check cache first
        const cached = this.cache.get(secretName);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            logger.debug('Using cached secret', { secretName });
            return cached.value;
        }

        if (!this.client) {
            throw new Error('AWS Secrets Manager client not initialized');
        }

        try {
            logger.info('Fetching secret from AWS Secrets Manager', { secretName });
            
            const command = new GetSecretValueCommand({
                SecretId: secretName
            });

            const response = await this.client.send(command);
            const secret = JSON.parse(response.SecretString);

            // Cache the secret
            this.cache.set(secretName, {
                value: secret,
                timestamp: Date.now()
            });

            logger.info('Successfully retrieved secret from AWS Secrets Manager', { 
                secretName,
                keys: Object.keys(secret)
            });

            return secret;
        } catch (error) {
            logger.error('Failed to retrieve secret from AWS Secrets Manager:', {
                secretName,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Get all application secrets from multiple organized secrets
     */
    async getAllSecrets() {
        try {
            // Get all secrets in parallel
            const [muxSecrets, databaseSecrets, jwtSecrets, s3Secrets, appSecrets] = await Promise.allSettled([
                this.getSecret('sauti-media-baas/mux-config'),
                this.getSecret('sauti-media-baas/database-config'), 
                this.getSecret('sauti-media-baas/jwt-config'),
                this.getSecret('sauti-media-baas/s3-config'),
                this.getSecret('sauti-media-baas/app-config')
            ]);

            // Combine all secrets into one object
            const combinedSecrets = {};
            
            if (muxSecrets.status === 'fulfilled') Object.assign(combinedSecrets, muxSecrets.value);
            if (databaseSecrets.status === 'fulfilled') Object.assign(combinedSecrets, databaseSecrets.value);
            if (jwtSecrets.status === 'fulfilled') Object.assign(combinedSecrets, jwtSecrets.value);
            if (s3Secrets.status === 'fulfilled') Object.assign(combinedSecrets, s3Secrets.value);
            if (appSecrets.status === 'fulfilled') Object.assign(combinedSecrets, appSecrets.value);

            logger.info('Successfully retrieved organized secrets from AWS Secrets Manager', {
                secretsFound: Object.keys(combinedSecrets),
                secretCount: Object.keys(combinedSecrets).length
            });

            return combinedSecrets;
        } catch (error) {
            logger.warn('Failed to get organized secrets from AWS Secrets Manager, using environment variables', {
                error: error.message
            });
            return null;
        }
    }

    /**
     * Get Mux credentials from AWS Secrets Manager
     */
    async getMuxCredentials() {
        try {
            // Try direct mux-config secret first (user's actual format)
            const muxSecrets = await this.getSecret('sauti-media-baas/mux-config');
            if (muxSecrets && muxSecrets.tokenId && muxSecrets.tokenSecret) {
                logger.info('Retrieved Mux credentials from dedicated secret');
                return {
                    tokenId: muxSecrets.tokenId,
                    tokenSecret: muxSecrets.tokenSecret
                };
            }

            // Fallback to combined secrets
            const secrets = await this.getAllSecrets();
            if (secrets && secrets.MUX_TOKEN_ID && secrets.MUX_TOKEN_SECRET) {
                logger.info('Retrieved Mux credentials from combined secrets');
                return {
                    tokenId: secrets.MUX_TOKEN_ID,
                    tokenSecret: secrets.MUX_TOKEN_SECRET
                };
            }
        } catch (error) {
            logger.warn('Failed to get Mux credentials from AWS Secrets Manager:', error.message);
        }

        // Fallback to environment variables
        logger.info('Using Mux credentials from environment variables');
        return {
            tokenId: process.env.MUX_TOKEN_ID,
            tokenSecret: process.env.MUX_TOKEN_SECRET
        };
    }

    /**
     * Get Supabase credentials from AWS Secrets Manager
     */
    async getSupabaseCredentials() {
        try {
            // Try direct database-config secret first (check for Supabase first, then DocumentDB)
            const dbSecrets = await this.getSecret('sauti-media-baas/database-config');
            if (dbSecrets) {
                // Check if it has Supabase credentials
                if (dbSecrets.SUPABASE_URL && dbSecrets.SUPABASE_ANON_KEY) {
                    logger.info('Retrieved Supabase credentials from database-config secret');
                    return {
                        url: dbSecrets.SUPABASE_URL,
                        anonKey: dbSecrets.SUPABASE_ANON_KEY,
                        serviceRoleKey: dbSecrets.SUPABASE_SERVICE_ROLE_KEY
                    };
                }
                // Legacy DocumentDB check (deprecated)
                if (dbSecrets.documentdbClusterEndpoint) {
                    logger.warn('DocumentDB found in database-config, but Supabase is preferred. Please update secret to include Supabase credentials.');
                    return {
                        url: null,
                        anonKey: null,
                        serviceRoleKey: null,
                        documentDbConfig: dbSecrets
                    };
                }
            }

            // Try dedicated supabase-config secret
            const supabaseSecrets = await this.getSecret('sauti-media-baas/supabase-config');
            if (supabaseSecrets && supabaseSecrets.SUPABASE_URL && supabaseSecrets.SUPABASE_ANON_KEY) {
                logger.info('Retrieved Supabase credentials from dedicated supabase-config secret');
                return {
                    url: supabaseSecrets.SUPABASE_URL,
                    anonKey: supabaseSecrets.SUPABASE_ANON_KEY,
                    serviceRoleKey: supabaseSecrets.SUPABASE_SERVICE_ROLE_KEY
                };
            }

            // Fallback to combined secrets
            const secrets = await this.getAllSecrets();
            if (secrets && secrets.SUPABASE_URL && secrets.SUPABASE_ANON_KEY) {
                logger.info('Retrieved Supabase credentials from combined secrets');
                return {
                    url: secrets.SUPABASE_URL,
                    anonKey: secrets.SUPABASE_ANON_KEY,
                    serviceRoleKey: secrets.SUPABASE_SERVICE_ROLE_KEY
                };
            }
        } catch (error) {
            logger.warn('Failed to get Supabase credentials from AWS Secrets Manager:', error.message);
        }

        // Fallback to environment variables
        logger.info('Using Supabase credentials from environment variables');
        return {
            url: process.env.SUPABASE_URL,
            anonKey: process.env.SUPABASE_ANON_KEY,
            serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
        };
    }

    /**
     * Get S3 credentials from AWS Secrets Manager
     */
    async getS3Credentials() {
        try {
            // Try direct s3-config secret first
            const s3Secrets = await this.getSecret('sauti-media-baas/s3-config');
            if (s3Secrets && s3Secrets.S3_BUCKET) {
                logger.info('Retrieved S3 credentials from dedicated secret');
                return {
                    accessKeyId: s3Secrets.AWS_ACCESS_KEY_ID,
                    secretAccessKey: s3Secrets.AWS_SECRET_ACCESS_KEY,
                    region: s3Secrets.AWS_REGION || process.env.AWS_REGION || 'us-east-1',
                    bucket: s3Secrets.S3_BUCKET
                };
            }

            // Fallback to combined secrets
            const secrets = await this.getAllSecrets();
            if (secrets && secrets.S3_BUCKET) {
                logger.info('Retrieved S3 credentials from combined secrets');
                return {
                    accessKeyId: secrets.AWS_ACCESS_KEY_ID,
                    secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY,
                    region: secrets.AWS_REGION || process.env.AWS_REGION || 'us-east-1',
                    bucket: secrets.S3_BUCKET
                };
            }
        } catch (error) {
            logger.warn('Failed to get S3 credentials from AWS Secrets Manager:', error.message);
        }

        // Fallback to environment variables or IAM role
        logger.info('Using S3 credentials from environment variables or IAM role');
        return {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION || 'us-east-1',
            bucket: process.env.S3_BUCKET
        };
    }

    /**
     * Check if AWS Secrets Manager is configured
     */
    isConfigured() {
        return this.client !== null && process.env.USE_AWS_SECRETS_MANAGER === 'true';
    }

    /**
     * Clear cache (useful for testing or credential rotation)
     */
    clearCache() {
        this.cache.clear();
        logger.info('AWS Secrets Manager cache cleared');
    }
}

// Singleton instance
const awsSecretsConfig = new AWSSecretsConfig();

module.exports = {
    getSecret: (secretName) => awsSecretsConfig.getSecret(secretName),
    getAllSecrets: () => awsSecretsConfig.getAllSecrets(),
    getMuxCredentials: () => awsSecretsConfig.getMuxCredentials(),
    getSupabaseCredentials: () => awsSecretsConfig.getSupabaseCredentials(),
    getS3Credentials: () => awsSecretsConfig.getS3Credentials(),
    isConfigured: () => awsSecretsConfig.isConfigured(),
    clearCache: () => awsSecretsConfig.clearCache()
};