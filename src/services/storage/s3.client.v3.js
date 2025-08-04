/**
 * S3 Storage Client for the Sauti Media BaaS using AWS SDK v3
 * Handles communication with AWS S3 for secure cloud storage
 */
const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { setupConfig } = require('../../config');
const { logger } = require('../../common/logger');
const { ApiError } = require('../../api-gateway/middleware/error.middleware');
const crypto = require('crypto');

/**
 * S3ClientV3 class for interacting with AWS S3 using SDK v3
 */
class S3ClientV3 {
  /**
   * Creates a new S3ClientV3 instance
   */
  constructor() {
    this.config = setupConfig();
    const s3Config = this.config.storage && this.config.storage.s3;
    if (!s3Config || !s3Config.region) {
      logger.error('S3 configuration not found');
      throw new Error('S3 configuration not found');
    }
    this.config.s3 = s3Config; // for backward compatibility with rest of the class
    
    // Initialize AWS SDK v3 client with configuration
    const clientConfig = {
      region: this.config.s3.region,
      // If credentials are provided in config, use them
      // Otherwise, AWS SDK will use the default credential provider chain
      ...(this.config.s3.accessKeyId && this.config.s3.secretAccessKey && {
        credentials: {
          accessKeyId: this.config.s3.accessKeyId,
          secretAccessKey: this.config.s3.secretAccessKey,
        },
      }),
    };
    
    // Add endpoint configuration if provided
    if (this.config.s3.endpoint) {
      clientConfig.endpoint = this.config.s3.endpoint;
    }
    
    // Enable S3 Transfer Acceleration if configured
    if (this.config.s3.useAccelerateEndpoint) {
      clientConfig.useAccelerateEndpoint = true;
    }
    
    // Initialize S3 client
    this.s3 = new S3Client(clientConfig);
    
    // Default bucket name from config
    this.defaultBucket = this.config.s3.bucket;
    
    // Configure retry settings
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }
  
  /**
   * Uploads a file to S3 with server-side encryption
   * @param {Object} options - Upload options
   * @param {Buffer|ReadableStream} options.body - File content
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @param {string} options.contentType - MIME type of the file
   * @param {Object} options.metadata - Additional metadata for the file
   * @param {string} options.storageClass - S3 storage class (STANDARD, STANDARD_IA, ONEZONE_IA, etc.)
   * @param {string} options.encryptionType - Type of encryption (AES256 or aws:kms)
   * @param {string} options.kmsKeyId - KMS key ID for aws:kms encryption
   * @returns {Promise<Object>} - Upload result
   */
  async uploadFile(options) {
    try {
      const { 
        body, 
        key, 
        bucket = this.defaultBucket, 
        contentType = 'application/octet-stream',
        metadata = {},
        storageClass = 'STANDARD',
        encryptionType = 'AES256',
        kmsKeyId,
      } = options;
      
      if (!body) {
        throw new ApiError(400, 'File content is required');
      }
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Prepare upload parameters with server-side encryption
      const uploadParams = {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: this._sanitizeMetadata(metadata),
        StorageClass: storageClass,
        ServerSideEncryption: encryptionType,
      };
      
      // Add KMS key ID if using aws:kms encryption
      if (encryptionType === 'aws:kms' && kmsKeyId) {
        uploadParams.SSEKMSKeyId = kmsKeyId;
      }
      
      // Upload file with retry logic
      const command = new PutObjectCommand(uploadParams);
      const result = await this._withRetry(() => this.s3.send(command));
      
      logger.info('File uploaded successfully', { 
        bucket, 
        key, 
        etag: result.ETag,
        storageClass,
        encryptionType,
      });
      
      // Return standardized response
      return {
        bucket,
        key,
        location: `https://${bucket}.s3.${this.config.s3.region}.amazonaws.com/${key}`,
        etag: result.ETag,
        versionId: result.VersionId,
        encryptionType: encryptionType,
      };
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Generates a pre-signed URL for direct client-side uploads
   * @param {Object} options - Pre-signed URL options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @param {string} options.contentType - MIME type of the file
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @param {Object} options.metadata - Additional metadata for the file
   * @param {string} options.storageClass - S3 storage class
   * @param {string} options.encryptionType - Type of encryption (AES256 or aws:kms)
   * @param {string} options.kmsKeyId - KMS key ID for aws:kms encryption
   * @returns {Promise<Object>} - Pre-signed URL details
   */
  async getPresignedUploadUrl(options) {
    try {
      const { 
        key, 
        bucket = this.defaultBucket, 
        contentType = 'application/octet-stream',
        expiresIn = 3600, // 1 hour
        metadata = {},
        storageClass = 'STANDARD',
        encryptionType = 'AES256',
        kmsKeyId,
      } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Prepare parameters for pre-signed URL
      const params = {
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        Metadata: this._sanitizeMetadata(metadata),
        StorageClass: storageClass,
        ServerSideEncryption: encryptionType,
      };
      
      // Add KMS key ID if using aws:kms encryption
      if (encryptionType === 'aws:kms' && kmsKeyId) {
        params.SSEKMSKeyId = kmsKeyId;
      }
      
      // Generate pre-signed URL
      const command = new PutObjectCommand(params);
      const url = await this._withRetry(() => 
        getSignedUrl(this.s3, command, { expiresIn })
      );
      
      logger.info('Pre-signed upload URL generated', { 
        bucket, 
        key, 
        expiresIn,
        storageClass,
        encryptionType,
      });
      
      // Calculate expiry time
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
      
      // Return standardized response
      return {
        url,
        bucket,
        key,
        expiresAt: expiryDate.toISOString(),
        contentType,
        storageClass,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error generating pre-signed upload URL:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Generates a pre-signed URL for downloading a file
   * @param {Object} options - Pre-signed URL options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @param {string} options.fileName - Suggested filename for download (optional)
   * @returns {Promise<Object>} - Pre-signed URL details
   */
  async getPresignedDownloadUrl(options) {
    try {
      const { 
        key, 
        bucket = this.defaultBucket, 
        expiresIn = 3600, // 1 hour
        fileName,
      } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Prepare parameters for pre-signed URL
      const params = {
        Bucket: bucket,
        Key: key,
      };
      
      // Add content disposition if fileName is provided
      if (fileName) {
        params.ResponseContentDisposition = `attachment; filename="${encodeURIComponent(fileName)}"`;
      }
      
      // Generate pre-signed URL
      const command = new GetObjectCommand(params);
      const url = await this._withRetry(() => 
        getSignedUrl(this.s3, command, { expiresIn })
      );
      
      logger.info('Pre-signed download URL generated', { 
        bucket, 
        key, 
        expiresIn,
      });
      
      // Calculate expiry time
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);
      
      // Return standardized response
      return {
        url,
        bucket,
        key,
        expiresAt: expiryDate.toISOString(),
        fileName: fileName || key.split('/').pop(),
      };
    } catch (error) {
      logger.error('Error generating pre-signed download URL:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Downloads a file from S3
   * @param {Object} options - Download options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @returns {Promise<Object>} - File content and metadata
   */
  async downloadFile(options) {
    try {
      const { key, bucket = this.defaultBucket } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Download file with retry logic
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const result = await this._withRetry(() => this.s3.send(command));
      
      // Convert stream to buffer for compatibility with v2 API
      const body = await this._streamToBuffer(result.Body);
      
      logger.info('File downloaded successfully', { 
        bucket, 
        key, 
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      });
      
      // Return standardized response
      return {
        body,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        etag: result.ETag,
        lastModified: result.LastModified,
        metadata: result.Metadata,
        versionId: result.VersionId,
        serverSideEncryption: result.ServerSideEncryption,
      };
    } catch (error) {
      logger.error('Error downloading file from S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Deletes a file from S3
   * @param {Object} options - Delete options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @returns {Promise<Object>} - Deletion confirmation
   */
  async deleteFile(options) {
    try {
      const { key, bucket = this.defaultBucket } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Delete file with retry logic
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      await this._withRetry(() => this.s3.send(command));
      
      logger.info('File deleted successfully', { bucket, key });
      
      // Return standardized response
      return {
        deleted: true,
        bucket,
        key,
      };
    } catch (error) {
      logger.error('Error deleting file from S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Copies a file within S3
   * @param {Object} options - Copy options
   * @param {string} options.sourceKey - Source S3 object key
   * @param {string} options.sourceBucket - Source S3 bucket name (optional, uses default if not provided)
   * @param {string} options.destinationKey - Destination S3 object key
   * @param {string} options.destinationBucket - Destination S3 bucket name (optional, uses default if not provided)
   * @param {string} options.encryptionType - Type of encryption for destination (AES256 or aws:kms)
   * @param {string} options.kmsKeyId - KMS key ID for aws:kms encryption
   * @returns {Promise<Object>} - Copy result
   */
  async copyFile(options) {
    try {
      const { 
        sourceKey, 
        sourceBucket = this.defaultBucket,
        destinationKey,
        destinationBucket = this.defaultBucket,
        encryptionType = 'AES256',
        kmsKeyId,
      } = options;
      
      if (!sourceKey) {
        throw new ApiError(400, 'Source key is required');
      }
      
      if (!sourceBucket) {
        throw new ApiError(400, 'Source bucket is required');
      }
      
      if (!destinationKey) {
        throw new ApiError(400, 'Destination key is required');
      }
      
      if (!destinationBucket) {
        throw new ApiError(400, 'Destination bucket is required');
      }
      
      // Prepare copy parameters with server-side encryption
      const copyParams = {
        Bucket: destinationBucket,
        Key: destinationKey,
        CopySource: `/${sourceBucket}/${encodeURIComponent(sourceKey)}`,
        ServerSideEncryption: encryptionType,
      };
      
      // Add KMS key ID if using aws:kms encryption
      if (encryptionType === 'aws:kms' && kmsKeyId) {
        copyParams.SSEKMSKeyId = kmsKeyId;
      }
      
      // Copy file with retry logic
      const command = new CopyObjectCommand(copyParams);
      const result = await this._withRetry(() => this.s3.send(command));
      
      logger.info('File copied successfully', { 
        sourceBucket, 
        sourceKey, 
        destinationBucket, 
        destinationKey,
        etag: result.CopyObjectResult?.ETag,
        encryptionType,
      });
      
      // Return standardized response
      return {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
        etag: result.CopyObjectResult?.ETag,
        lastModified: result.CopyObjectResult?.LastModified,
        versionId: result.VersionId,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error copying file in S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Lists files in an S3 bucket or prefix
   * @param {Object} options - List options
   * @param {string} options.prefix - S3 prefix (folder path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @param {string} options.delimiter - Delimiter for hierarchy (default: '/')
   * @param {number} options.maxKeys - Maximum number of keys to return (default: 1000)
   * @param {string} options.continuationToken - Token for pagination
   * @returns {Promise<Object>} - List result
   */
  async listFiles(options) {
    try {
      const { 
        prefix = '', 
        bucket = this.defaultBucket,
        delimiter = '/',
        maxKeys = 1000,
        continuationToken,
      } = options;
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Prepare list parameters
      const listParams = {
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: delimiter,
        MaxKeys: maxKeys,
      };
      
      // Add continuation token if provided
      if (continuationToken) {
        listParams.ContinuationToken = continuationToken;
      }
      
      // List files with retry logic
      const command = new ListObjectsV2Command(listParams);
      const result = await this._withRetry(() => this.s3.send(command));
      
      logger.info('Files listed successfully', { 
        bucket, 
        prefix, 
        count: result.Contents?.length || 0,
        isTruncated: result.IsTruncated,
      });
      
      // Transform S3 response to a more user-friendly format
      const files = (result.Contents || []).map(item => ({
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        etag: item.ETag,
        storageClass: item.StorageClass,
      }));
      
      const folders = (result.CommonPrefixes || []).map(prefix => ({
        prefix: prefix.Prefix,
        name: prefix.Prefix.split('/').slice(-2)[0],
      }));
      
      // Return standardized response
      return {
        files,
        folders,
        prefix,
        bucket,
        isTruncated: result.IsTruncated,
        nextContinuationToken: result.NextContinuationToken,
        keyCount: result.KeyCount,
      };
    } catch (error) {
      logger.error('Error listing files in S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Gets metadata for a file in S3
   * @param {Object} options - Metadata options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @returns {Promise<Object>} - File metadata
   */
  async getFileMetadata(options) {
    try {
      const { key, bucket = this.defaultBucket } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // Get file metadata with retry logic
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const result = await this._withRetry(() => this.s3.send(command));
      
      logger.info('File metadata retrieved successfully', { 
        bucket, 
        key, 
        contentType: result.ContentType,
        contentLength: result.ContentLength,
      });
      
      // Return standardized response
      return {
        key,
        bucket,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        etag: result.ETag,
        lastModified: result.LastModified,
        metadata: result.Metadata || {},
        versionId: result.VersionId,
        serverSideEncryption: result.ServerSideEncryption,
        storageClass: result.StorageClass,
      };
    } catch (error) {
      logger.error('Error getting file metadata from S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Updates metadata for a file in S3
   * @param {Object} options - Update options
   * @param {string} options.key - S3 object key (file path)
   * @param {string} options.bucket - S3 bucket name (optional, uses default if not provided)
   * @param {Object} options.metadata - New metadata for the file
   * @param {string} options.encryptionType - Type of encryption (AES256 or aws:kms)
   * @param {string} options.kmsKeyId - KMS key ID for aws:kms encryption
   * @returns {Promise<Object>} - Update result
   */
  async updateFileMetadata(options) {
    try {
      const { 
        key, 
        bucket = this.defaultBucket,
        metadata = {},
        encryptionType = 'AES256',
        kmsKeyId,
      } = options;
      
      if (!key) {
        throw new ApiError(400, 'File key is required');
      }
      
      if (!bucket) {
        throw new ApiError(400, 'Bucket name is required');
      }
      
      // First, get the current metadata to preserve existing values
      const currentMetadata = await this.getFileMetadata({ key, bucket });
      
      // Prepare copy parameters with updated metadata
      const copyParams = {
        Bucket: bucket,
        Key: key,
        CopySource: `/${bucket}/${encodeURIComponent(key)}`,
        MetadataDirective: 'REPLACE',
        ContentType: currentMetadata.contentType,
        Metadata: {
          ...currentMetadata.metadata,
          ...this._sanitizeMetadata(metadata),
        },
        ServerSideEncryption: encryptionType,
      };
      
      // Add KMS key ID if using aws:kms encryption
      if (encryptionType === 'aws:kms' && kmsKeyId) {
        copyParams.SSEKMSKeyId = kmsKeyId;
      }
      
      // Update metadata with retry logic (S3 requires a copy operation to update metadata)
      const command = new CopyObjectCommand(copyParams);
      const result = await this._withRetry(() => this.s3.send(command));
      
      logger.info('File metadata updated successfully', { 
        bucket, 
        key, 
        etag: result.CopyObjectResult?.ETag,
      });
      
      // Return standardized response
      return {
        key,
        bucket,
        etag: result.CopyObjectResult?.ETag,
        lastModified: result.CopyObjectResult?.LastModified,
        versionId: result.VersionId,
        metadata: copyParams.Metadata,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error updating file metadata in S3:', error);
      this._handleS3Error(error);
    }
  }
  
  /**
   * Sanitizes metadata to ensure it only contains valid characters
   * @param {Object} metadata - Metadata object
   * @returns {Object} - Sanitized metadata
   * @private
   */
  _sanitizeMetadata(metadata) {
    const sanitized = {};
    
    // Ensure metadata is an object
    if (!metadata || typeof metadata !== 'object') {
      return sanitized;
    }
    
    // Process each key-value pair
    Object.entries(metadata).forEach(([key, value]) => {
      // Convert key to lowercase and replace invalid characters
      const sanitizedKey = key.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      // Convert value to string
      const sanitizedValue = String(value);
      
      // Add to sanitized metadata
      sanitized[sanitizedKey] = sanitizedValue;
    });
    
    return sanitized;
  }
  
  /**
   * Converts a stream to a buffer
   * @param {ReadableStream} stream - Stream to convert
   * @returns {Promise<Buffer>} - Buffer containing stream data
   * @private
   */
  async _streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
  
  /**
   * Executes a function with retry logic
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} - Function result
   * @private
   */
  async _withRetry(fn) {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this._isRetryableError(error)) {
          throw error;
        }
        
        // Calculate backoff delay with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt);
        logger.warn(`Retrying S3 operation after ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`, { error });
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    throw lastError;
  }
  
  /**
   * Checks if an error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} - Whether the error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Retry on network errors and certain AWS error codes
    const retryableCodes = [
      'RequestTimeout',
      'InternalError',
      'ServiceUnavailable',
      'SlowDown',
      'ThrottlingException',
      'ProvisionedThroughputExceededException',
      'RequestLimitExceeded',
    ];
    
    return (
      !error.name || // Network error
      retryableCodes.includes(error.name) || // Specific AWS error codes
      (error.$metadata && error.$metadata.httpStatusCode >= 500) // Server errors
    );
  }
  
  /**
   * Handles S3 errors
   * @param {Error} error - Error to handle
   * @throws {ApiError} - Transformed API error
   * @private
   */
  _handleS3Error(error) {
    // Transform S3 errors into standardized API errors
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Handle specific S3 error codes
    switch (error.name) {
      case 'NoSuchBucket':
        throw new ApiError(404, 'Bucket not found', { s3Error: error.message });
      case 'NoSuchKey':
        throw new ApiError(404, 'File not found', { s3Error: error.message });
      case 'AccessDenied':
        throw new ApiError(403, 'Access denied to S3 resource', { s3Error: error.message });
      case 'InvalidAccessKeyId':
        throw new ApiError(401, 'Invalid S3 credentials', { s3Error: error.message });
      case 'SignatureDoesNotMatch':
        throw new ApiError(401, 'Invalid S3 signature', { s3Error: error.message });
      case 'EntityTooLarge':
        throw new ApiError(413, 'File too large for S3 upload', { s3Error: error.message });
      case 'InvalidArgument':
      case 'InvalidRequest':
        throw new ApiError(400, 'Invalid S3 request', { s3Error: error.message });
      case 'SlowDown':
      case 'ThrottlingException':
        throw new ApiError(429, 'S3 request rate limit exceeded', { s3Error: error.message });
      default:
        if (error.$metadata && error.$metadata.httpStatusCode === 404) {
          throw new ApiError(404, 'S3 resource not found', { s3Error: error.message });
        } else if (error.$metadata && error.$metadata.httpStatusCode === 403) {
          throw new ApiError(403, 'Access denied to S3 resource', { s3Error: error.message });
        } else if (error.$metadata && error.$metadata.httpStatusCode === 400) {
          throw new ApiError(400, 'Invalid S3 request', { s3Error: error.message });
        } else if (error.$metadata && error.$metadata.httpStatusCode >= 500) {
          throw new ApiError(502, 'S3 server error', { s3Error: error.message });
        }
    }
    
    // Default error handling
    throw new ApiError(500, 'Error communicating with S3', { s3Error: error.message });
  }
}

// Export singleton instance
let s3ClientV3Instance = null;

/**
 * Gets the S3ClientV3 singleton instance
 * @returns {S3ClientV3} - S3ClientV3 instance
 */
function getS3ClientV3() {
  if (!s3ClientV3Instance) {
    s3ClientV3Instance = new S3ClientV3();
  }
  return s3ClientV3Instance;
}

module.exports = {
  getS3ClientV3,
  S3ClientV3,
};