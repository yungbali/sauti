/**
 * AWS S3 Storage Service with Secrets Manager Integration
 * Handles file storage in S3 with credentials from AWS Secrets Manager
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { logger } = require('../../common/logger');
const { getS3Credentials } = require('../../config/aws-secrets.config');

class S3StorageService {
    constructor() {
        this.s3Client = null;
        this.bucket = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            return;
        }

        try {
            // Get credentials from AWS Secrets Manager or environment variables
            const credentials = await getS3Credentials();
            const { accessKeyId, secretAccessKey, region, bucket } = credentials;

            if (!bucket) {
                logger.warn('S3 bucket not configured. File storage will be disabled.');
                return;
            }

            const clientConfig = {
                region
            };

            // Add credentials only if they are provided (otherwise use IAM role)
            if (accessKeyId && secretAccessKey) {
                clientConfig.credentials = {
                    accessKeyId,
                    secretAccessKey
                };
            }

            this.s3Client = new S3Client(clientConfig);
            this.bucket = bucket;
            
            logger.info('S3 storage service initialized successfully', {
                bucket,
                region,
                credentialSource: accessKeyId ? 'aws-secrets-manager' : 'iam-role'
            });
            
            this.initialized = true;
        } catch (error) {
            logger.error('Failed to initialize S3 storage service:', error);
        }
    }

    async uploadFile(key, buffer, contentType = 'application/octet-stream', metadata = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.s3Client) {
            throw new Error('S3 storage service not configured');
        }

        try {
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                Metadata: metadata
            });

            const result = await this.s3Client.send(command);
            
            logger.info('File uploaded to S3 successfully', {
                bucket: this.bucket,
                key,
                contentType,
                etag: result.ETag
            });

            return {
                key,
                bucket: this.bucket,
                url: `https://${this.bucket}.s3.amazonaws.com/${key}`,
                etag: result.ETag
            };
        } catch (error) {
            logger.error('Failed to upload file to S3:', error);
            throw error;
        }
    }

    async getFile(key) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.s3Client) {
            throw new Error('S3 storage service not configured');
        }

        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const result = await this.s3Client.send(command);
            
            return {
                key,
                body: result.Body,
                contentType: result.ContentType,
                lastModified: result.LastModified,
                metadata: result.Metadata
            };
        } catch (error) {
            logger.error('Failed to get file from S3:', error);
            throw error;
        }
    }

    async deleteFile(key) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.s3Client) {
            throw new Error('S3 storage service not configured');
        }

        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await this.s3Client.send(command);
            
            logger.info('File deleted from S3 successfully', {
                bucket: this.bucket,
                key
            });

            return { success: true };
        } catch (error) {
            logger.error('Failed to delete file from S3:', error);
            throw error;
        }
    }

    async getSignedUploadUrl(key, contentType = 'application/octet-stream', expiresIn = 3600) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.s3Client) {
            throw new Error('S3 storage service not configured');
        }

        try {
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType
            });

            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
            
            logger.info('Generated signed upload URL', {
                bucket: this.bucket,
                key,
                expiresIn
            });

            return {
                url: signedUrl,
                key,
                bucket: this.bucket,
                expiresIn
            };
        } catch (error) {
            logger.error('Failed to generate signed upload URL:', error);
            throw error;
        }
    }

    async getSignedDownloadUrl(key, expiresIn = 3600) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!this.s3Client) {
            throw new Error('S3 storage service not configured');
        }

        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
            
            return {
                url: signedUrl,
                key,
                bucket: this.bucket,
                expiresIn
            };
        } catch (error) {
            logger.error('Failed to generate signed download URL:', error);
            throw error;
        }
    }

    async isConfigured() {
        if (!this.initialized) {
            await this.initialize();
        }
        return this.s3Client !== null;
    }
}

// Singleton instance
const s3StorageService = new S3StorageService();

module.exports = s3StorageService;