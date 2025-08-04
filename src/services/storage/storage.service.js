/**
 * Storage Service for the Sauti Media BaaS
 * Provides a high-level abstraction for secure cloud storage operations
 */
const { getS3ClientV3 } = require('./s3.client.v3');
const { logger } = require('../../common/logger');
const { ApiError } = require('../../api-gateway/middleware/error.middleware');
const { setupConfig } = require('../../config');
const crypto = require('crypto');
const path = require('path');

/**
 * StorageService class for managing secure cloud storage
 */
class StorageService {
  /**
   * Creates a new StorageService instance
   */
  constructor() {
    this.s3Client = getS3ClientV3();
    this.config = setupConfig();
    
    // Define storage buckets and prefixes
    this.buckets = {
      assets: this.config.s3?.assetsBucket || this.config.s3?.bucket,
      thumbnails: this.config.s3?.thumbnailsBucket || this.config.s3?.bucket,
      temp: this.config.s3?.tempBucket || this.config.s3?.bucket,
    };
    
    // Define storage prefixes
    this.prefixes = {
      assets: this.config.s3?.assetsPrefix || 'assets/',
      thumbnails: this.config.s3?.thumbnailsPrefix || 'thumbnails/',
      temp: this.config.s3?.tempPrefix || 'temp/',
    };
    
    // Define storage classes
    this.storageClasses = {
      standard: 'STANDARD',
      infrequentAccess: 'STANDARD_IA',
      glacier: 'GLACIER',
      deepArchive: 'DEEP_ARCHIVE',
    };
    
    // Define encryption types
    this.encryptionTypes = {
      aes256: 'AES256',
      kms: 'aws:kms',
    };
  }
  
  /**
   * Uploads a media asset to secure storage
   * @param {Object} options - Upload options
   * @param {Buffer|ReadableStream} options.content - File content
   * @param {string} options.fileName - Original file name
   * @param {string} options.contentType - MIME type of the file
   * @param {string} options.assetType - Type of asset (video, audio, image, document)
   * @param {Object} options.metadata - Additional metadata for the asset
   * @param {string} options.storageClass - Storage class for the asset
   * @param {boolean} options.encrypt - Whether to encrypt the asset with KMS (default: true)
   * @returns {Promise<Object>} - Upload result
   */
  async uploadAsset(options) {
    try {
      const { 
        content, 
        fileName, 
        contentType, 
        assetType = 'video',
        metadata = {},
        storageClass = this.storageClasses.standard,
        encrypt = true,
      } = options;
      
      if (!content) {
        throw new ApiError(400, 'Asset content is required');
      }
      
      if (!fileName) {
        throw new ApiError(400, 'File name is required');
      }
      
      if (!contentType) {
        throw new ApiError(400, 'Content type is required');
      }
      
      // Generate a unique asset ID
      const assetId = this._generateAssetId();
      
      // Generate a unique file key with proper organization
      const fileKey = this._generateAssetKey(assetId, fileName, assetType);
      
      // Prepare metadata with additional asset information
      const enhancedMetadata = {
        ...metadata,
        'asset-id': assetId,
        'original-filename': fileName,
        'asset-type': assetType,
        'upload-date': new Date().toISOString(),
      };
      
      // Determine encryption settings
      const encryptionType = encrypt ? this.encryptionTypes.kms : this.encryptionTypes.aes256;
      const kmsKeyId = encrypt ? this.config.s3?.kmsKeyId : undefined;
      
      // Upload the asset to S3
      const result = await this.s3Client.uploadFile({
        body: content,
        key: fileKey,
        bucket: this.buckets.assets,
        contentType,
        metadata: enhancedMetadata,
        storageClass,
        encryptionType,
        kmsKeyId,
      });
      
      logger.info('Asset uploaded successfully', { 
        assetId, 
        fileKey, 
        contentType,
        storageClass,
        encryptionType,
      });
      
      // Return standardized response
      return {
        assetId,
        fileKey: result.key,
        bucket: result.bucket,
        location: result.location,
        contentType,
        size: content.length || 'unknown',
        metadata: enhancedMetadata,
        storageClass,
        encrypted: encrypt,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error uploading asset:', error);
      throw error;
    }
  }
  
  /**
   * Generates a pre-signed URL for direct client-side asset uploads
   * @param {Object} options - Pre-signed URL options
   * @param {string} options.fileName - Original file name
   * @param {string} options.contentType - MIME type of the file
   * @param {string} options.assetType - Type of asset (video, audio, image, document)
   * @param {Object} options.metadata - Additional metadata for the asset
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @param {string} options.storageClass - Storage class for the asset
   * @param {boolean} options.encrypt - Whether to encrypt the asset with KMS (default: true)
   * @returns {Promise<Object>} - Pre-signed URL details
   */
  async getAssetUploadUrl(options) {
    try {
      const { 
        fileName, 
        contentType, 
        assetType = 'video',
        metadata = {},
        expiresIn = 3600, // 1 hour
        storageClass = this.storageClasses.standard,
        encrypt = true,
      } = options;
      
      if (!fileName) {
        throw new ApiError(400, 'File name is required');
      }
      
      if (!contentType) {
        throw new ApiError(400, 'Content type is required');
      }
      
      // Generate a unique asset ID
      const assetId = this._generateAssetId();
      
      // Generate a unique file key with proper organization
      const fileKey = this._generateAssetKey(assetId, fileName, assetType);
      
      // Prepare metadata with additional asset information
      const enhancedMetadata = {
        ...metadata,
        'asset-id': assetId,
        'original-filename': fileName,
        'asset-type': assetType,
        'upload-date': new Date().toISOString(),
      };
      
      // Determine encryption settings
      const encryptionType = encrypt ? this.encryptionTypes.kms : this.encryptionTypes.aes256;
      const kmsKeyId = encrypt ? this.config.s3?.kmsKeyId : undefined;
      
      // Generate pre-signed URL
      const result = await this.s3Client.getPresignedUploadUrl({
        key: fileKey,
        bucket: this.buckets.assets,
        contentType,
        expiresIn,
        metadata: enhancedMetadata,
        storageClass,
        encryptionType,
        kmsKeyId,
      });
      
      logger.info('Asset upload URL generated', { 
        assetId, 
        fileKey, 
        contentType,
        expiresIn,
      });
      
      // Return standardized response
      return {
        assetId,
        uploadUrl: result.url,
        fileKey: result.key,
        bucket: result.bucket,
        expiresAt: result.expiresAt,
        contentType,
        metadata: enhancedMetadata,
        storageClass,
        encrypted: encrypt,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error generating asset upload URL:', error);
      throw error;
    }
  }
  
  /**
   * Generates a pre-signed URL for downloading an asset
   * @param {Object} options - Download options
   * @param {string} options.assetId - Asset ID
   * @param {string} options.fileKey - S3 object key (optional, will be derived from assetId if not provided)
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @param {string} options.fileName - Suggested filename for download (optional)
   * @returns {Promise<Object>} - Pre-signed URL details
   */
  async getAssetDownloadUrl(options) {
    try {
      const { 
        assetId, 
        fileKey, 
        expiresIn = 3600, // 1 hour
        fileName,
      } = options;
      
      if (!assetId && !fileKey) {
        throw new ApiError(400, 'Either assetId or fileKey is required');
      }
      
      // If fileKey is not provided, try to find it using assetId
      const key = fileKey || await this._findAssetKeyById(assetId);
      
      if (!key) {
        throw new ApiError(404, 'Asset not found');
      }
      
      // Generate pre-signed URL
      const result = await this.s3Client.getPresignedDownloadUrl({
        key,
        bucket: this.buckets.assets,
        expiresIn,
        fileName: fileName || path.basename(key),
      });
      
      logger.info('Asset download URL generated', { 
        assetId, 
        fileKey: key, 
        expiresIn,
      });
      
      // Return standardized response
      return {
        assetId,
        downloadUrl: result.url,
        fileKey: result.key,
        bucket: result.bucket,
        expiresAt: result.expiresAt,
        fileName: result.fileName,
      };
    } catch (error) {
      logger.error('Error generating asset download URL:', error);
      throw error;
    }
  }
  
  /**
   * Gets metadata for an asset
   * @param {Object} options - Metadata options
   * @param {string} options.assetId - Asset ID
   * @param {string} options.fileKey - S3 object key (optional, will be derived from assetId if not provided)
   * @returns {Promise<Object>} - Asset metadata
   */
  async getAssetMetadata(options) {
    try {
      const { assetId, fileKey } = options;
      
      if (!assetId && !fileKey) {
        throw new ApiError(400, 'Either assetId or fileKey is required');
      }
      
      // If fileKey is not provided, try to find it using assetId
      const key = fileKey || await this._findAssetKeyById(assetId);
      
      if (!key) {
        throw new ApiError(404, 'Asset not found');
      }
      
      // Get file metadata from S3
      const result = await this.s3Client.getFileMetadata({
        key,
        bucket: this.buckets.assets,
      });
      
      logger.info('Asset metadata retrieved', { 
        assetId, 
        fileKey: key,
      });
      
      // Return standardized response
      return {
        assetId: assetId || result.metadata['asset-id'],
        fileKey: result.key,
        bucket: result.bucket,
        contentType: result.contentType,
        contentLength: result.contentLength,
        lastModified: result.lastModified,
        metadata: result.metadata,
        storageClass: result.storageClass,
        encrypted: !!result.serverSideEncryption,
        encryptionType: result.serverSideEncryption,
      };
    } catch (error) {
      logger.error('Error getting asset metadata:', error);
      throw error;
    }
  }
  
  /**
   * Updates metadata for an asset
   * @param {Object} options - Update options
   * @param {string} options.assetId - Asset ID
   * @param {string} options.fileKey - S3 object key (optional, will be derived from assetId if not provided)
   * @param {Object} options.metadata - New metadata for the asset
   * @returns {Promise<Object>} - Updated asset metadata
   */
  async updateAssetMetadata(options) {
    try {
      const { assetId, fileKey, metadata = {} } = options;
      
      if (!assetId && !fileKey) {
        throw new ApiError(400, 'Either assetId or fileKey is required');
      }
      
      if (!metadata || Object.keys(metadata).length === 0) {
        throw new ApiError(400, 'Metadata is required');
      }
      
      // If fileKey is not provided, try to find it using assetId
      const key = fileKey || await this._findAssetKeyById(assetId);
      
      if (!key) {
        throw new ApiError(404, 'Asset not found');
      }
      
      // Get current metadata to preserve asset-id and other system metadata
      const currentMetadata = await this.getAssetMetadata({ fileKey: key });
      
      // Prepare new metadata, preserving system fields
      const systemFields = ['asset-id', 'original-filename', 'asset-type', 'upload-date'];
      const newMetadata = { ...metadata };
      
      // Ensure system fields are not overwritten
      systemFields.forEach(field => {
        if (currentMetadata.metadata[field]) {
          newMetadata[field] = currentMetadata.metadata[field];
        }
      });
      
      // Update metadata in S3
      const result = await this.s3Client.updateFileMetadata({
        key,
        bucket: this.buckets.assets,
        metadata: newMetadata,
        encryptionType: currentMetadata.encryptionType || this.encryptionTypes.aes256,
        kmsKeyId: currentMetadata.encryptionType === this.encryptionTypes.kms ? this.config.s3?.kmsKeyId : undefined,
      });
      
      logger.info('Asset metadata updated', { 
        assetId, 
        fileKey: key,
      });
      
      // Return standardized response
      return {
        assetId: assetId || result.metadata['asset-id'],
        fileKey: result.key,
        bucket: result.bucket,
        lastModified: result.lastModified,
        metadata: result.metadata,
        encrypted: !!result.encryptionType,
        encryptionType: result.encryptionType,
      };
    } catch (error) {
      logger.error('Error updating asset metadata:', error);
      throw error;
    }
  }
  
  /**
   * Deletes an asset from storage
   * @param {Object} options - Delete options
   * @param {string} options.assetId - Asset ID
   * @param {string} options.fileKey - S3 object key (optional, will be derived from assetId if not provided)
   * @returns {Promise<Object>} - Deletion confirmation
   */
  async deleteAsset(options) {
    try {
      const { assetId, fileKey } = options;
      
      if (!assetId && !fileKey) {
        throw new ApiError(400, 'Either assetId or fileKey is required');
      }
      
      // If fileKey is not provided, try to find it using assetId
      const key = fileKey || await this._findAssetKeyById(assetId);
      
      if (!key) {
        throw new ApiError(404, 'Asset not found');
      }
      
      // Delete file from S3
      const result = await this.s3Client.deleteFile({
        key,
        bucket: this.buckets.assets,
      });
      
      logger.info('Asset deleted', { 
        assetId, 
        fileKey: key,
      });
      
      // Return standardized response
      return {
        assetId,
        fileKey: result.key,
        bucket: result.bucket,
        deleted: result.deleted,
      };
    } catch (error) {
      logger.error('Error deleting asset:', error);
      throw error;
    }
  }
  
  /**
   * Uploads a thumbnail for an asset
   * @param {Object} options - Upload options
   * @param {Buffer|ReadableStream} options.content - Thumbnail content
   * @param {string} options.assetId - Asset ID
   * @param {string} options.contentType - MIME type of the thumbnail
   * @param {string} options.thumbnailType - Type of thumbnail (poster, thumbnail, preview)
   * @returns {Promise<Object>} - Upload result
   */
  async uploadThumbnail(options) {
    try {
      const { 
        content, 
        assetId, 
        contentType = 'image/jpeg',
        thumbnailType = 'poster',
      } = options;
      
      if (!content) {
        throw new ApiError(400, 'Thumbnail content is required');
      }
      
      if (!assetId) {
        throw new ApiError(400, 'Asset ID is required');
      }
      
      // Generate a unique file key for the thumbnail
      const fileKey = this._generateThumbnailKey(assetId, thumbnailType);
      
      // Prepare metadata
      const metadata = {
        'asset-id': assetId,
        'thumbnail-type': thumbnailType,
        'upload-date': new Date().toISOString(),
      };
      
      // Upload the thumbnail to S3
      const result = await this.s3Client.uploadFile({
        body: content,
        key: fileKey,
        bucket: this.buckets.thumbnails,
        contentType,
        metadata,
        storageClass: this.storageClasses.standard,
        encryptionType: this.encryptionTypes.aes256, // Use AES256 for thumbnails for better performance
      });
      
      logger.info('Thumbnail uploaded', { 
        assetId, 
        fileKey, 
        thumbnailType,
      });
      
      // Return standardized response
      return {
        assetId,
        thumbnailType,
        fileKey: result.key,
        bucket: result.bucket,
        location: result.location,
        contentType,
        size: content.length || 'unknown',
      };
    } catch (error) {
      logger.error('Error uploading thumbnail:', error);
      throw error;
    }
  }
  
  /**
   * Generates a pre-signed URL for a thumbnail
   * @param {Object} options - URL options
   * @param {string} options.assetId - Asset ID
   * @param {string} options.thumbnailType - Type of thumbnail (poster, thumbnail, preview)
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @returns {Promise<Object>} - Pre-signed URL details
   */
  async getThumbnailUrl(options) {
    try {
      const { 
        assetId, 
        thumbnailType = 'poster',
        expiresIn = 3600, // 1 hour
      } = options;
      
      if (!assetId) {
        throw new ApiError(400, 'Asset ID is required');
      }
      
      // Generate the thumbnail key
      const fileKey = this._generateThumbnailKey(assetId, thumbnailType);
      
      // Check if the thumbnail exists
      try {
        await this.s3Client.getFileMetadata({
          key: fileKey,
          bucket: this.buckets.thumbnails,
        });
      } catch (error) {
        if (error.statusCode === 404) {
          throw new ApiError(404, 'Thumbnail not found');
        }
        throw error;
      }
      
      // Generate pre-signed URL
      const result = await this.s3Client.getPresignedDownloadUrl({
        key: fileKey,
        bucket: this.buckets.thumbnails,
        expiresIn,
      });
      
      logger.info('Thumbnail URL generated', { 
        assetId, 
        thumbnailType,
        expiresIn,
      });
      
      // Return standardized response
      return {
        assetId,
        thumbnailType,
        url: result.url,
        fileKey: result.key,
        bucket: result.bucket,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      logger.error('Error generating thumbnail URL:', error);
      throw error;
    }
  }
  
  /**
   * Creates a temporary storage location for file processing
   * @param {Object} options - Temp storage options
   * @param {string} options.prefix - Prefix for the temp location
   * @param {number} options.expiresIn - URL expiration time in seconds (default: 3600)
   * @param {string} options.contentType - Expected content type
   * @returns {Promise<Object>} - Temp storage details
   */
  async createTempStorage(options) {
    try {
      const { 
        prefix = 'upload', 
        expiresIn = 3600, // 1 hour
        contentType = 'application/octet-stream',
      } = options;
      
      // Generate a unique temp key
      const tempId = this._generateTempId();
      const fileKey = `${this.prefixes.temp}${prefix}/${tempId}`;
      
      // Generate pre-signed URL
      const result = await this.s3Client.getPresignedUploadUrl({
        key: fileKey,
        bucket: this.buckets.temp,
        contentType,
        expiresIn,
        metadata: {
          'temp-id': tempId,
          'created-at': new Date().toISOString(),
          'expires-at': new Date(Date.now() + expiresIn * 1000).toISOString(),
        },
      });
      
      logger.info('Temp storage created', { 
        tempId, 
        fileKey, 
        expiresIn,
      });
      
      // Return standardized response
      return {
        tempId,
        uploadUrl: result.url,
        fileKey: result.key,
        bucket: result.bucket,
        expiresAt: result.expiresAt,
        contentType,
      };
    } catch (error) {
      logger.error('Error creating temp storage:', error);
      throw error;
    }
  }
  
  /**
   * Moves a file from temporary storage to permanent storage
   * @param {Object} options - Move options
   * @param {string} options.tempKey - Temporary file key
   * @param {string} options.assetId - Asset ID for the permanent location
   * @param {string} options.fileName - Original file name
   * @param {string} options.assetType - Type of asset (video, audio, image, document)
   * @param {Object} options.metadata - Additional metadata for the asset
   * @param {string} options.storageClass - Storage class for the asset
   * @param {boolean} options.encrypt - Whether to encrypt the asset with KMS (default: true)
   * @returns {Promise<Object>} - Move result
   */
  async moveTempToAsset(options) {
    try {
      const { 
        tempKey, 
        assetId = this._generateAssetId(),
        fileName,
        assetType = 'video',
        metadata = {},
        storageClass = this.storageClasses.standard,
        encrypt = true,
      } = options;
      
      if (!tempKey) {
        throw new ApiError(400, 'Temporary file key is required');
      }
      
      if (!fileName) {
        throw new ApiError(400, 'File name is required');
      }
      
      // Generate the permanent file key
      const destinationKey = this._generateAssetKey(assetId, fileName, assetType);
      
      // Get metadata from temp file
      const tempMetadata = await this.s3Client.getFileMetadata({
        key: tempKey,
        bucket: this.buckets.temp,
      });
      
      // Prepare metadata for the permanent file
      const enhancedMetadata = {
        ...metadata,
        'asset-id': assetId,
        'original-filename': fileName,
        'asset-type': assetType,
        'upload-date': new Date().toISOString(),
        'content-type': tempMetadata.contentType,
      };
      
      // Determine encryption settings
      const encryptionType = encrypt ? this.encryptionTypes.kms : this.encryptionTypes.aes256;
      const kmsKeyId = encrypt ? this.config.s3?.kmsKeyId : undefined;
      
      // Copy the file to the permanent location
      const result = await this.s3Client.copyFile({
        sourceKey: tempKey,
        sourceBucket: this.buckets.temp,
        destinationKey,
        destinationBucket: this.buckets.assets,
        encryptionType,
        kmsKeyId,
      });
      
      // Delete the temporary file
      await this.s3Client.deleteFile({
        key: tempKey,
        bucket: this.buckets.temp,
      });
      
      // Update metadata on the permanent file
      await this.s3Client.updateFileMetadata({
        key: destinationKey,
        bucket: this.buckets.assets,
        metadata: enhancedMetadata,
        encryptionType,
        kmsKeyId,
      });
      
      logger.info('Temp file moved to asset storage', { 
        tempKey, 
        assetId, 
        destinationKey,
      });
      
      // Return standardized response
      return {
        assetId,
        fileKey: destinationKey,
        bucket: this.buckets.assets,
        contentType: tempMetadata.contentType,
        contentLength: tempMetadata.contentLength,
        metadata: enhancedMetadata,
        storageClass,
        encrypted: encrypt,
        encryptionType,
      };
    } catch (error) {
      logger.error('Error moving temp file to asset storage:', error);
      throw error;
    }
  }
  
  /**
   * Lists assets in storage
   * @param {Object} options - List options
   * @param {string} options.prefix - Prefix to filter assets (optional)
   * @param {string} options.assetType - Asset type to filter (optional)
   * @param {number} options.maxKeys - Maximum number of assets to return (default: 100)
   * @param {string} options.continuationToken - Token for pagination
   * @returns {Promise<Object>} - List of assets
   */
  async listAssets(options) {
    try {
      const { 
        prefix = '', 
        assetType,
        maxKeys = 100,
        continuationToken,
      } = options;
      
      // Construct the full prefix including the assets prefix
      const fullPrefix = `${this.prefixes.assets}${prefix}`;
      
      // List files from S3
      const result = await this.s3Client.listFiles({
        prefix: fullPrefix,
        bucket: this.buckets.assets,
        maxKeys,
        continuationToken,
      });
      
      // Filter and transform results
      const assets = await Promise.all(
        result.files
          // Filter by asset type if specified
          .filter(file => {
            if (!assetType) return true;
            // Extract asset type from key
            const match = file.key.match(/\/([^\/]+)\/[^\/]+$/);
            return match && match[1] === assetType;
          })
          // Get metadata for each asset
          .map(async file => {
            try {
              const metadata = await this.s3Client.getFileMetadata({
                key: file.key,
                bucket: this.buckets.assets,
              });
              
              return {
                assetId: metadata.metadata['asset-id'],
                fileKey: metadata.key,
                fileName: metadata.metadata['original-filename'] || path.basename(metadata.key),
                assetType: metadata.metadata['asset-type'],
                contentType: metadata.contentType,
                size: metadata.contentLength,
                lastModified: metadata.lastModified,
                metadata: metadata.metadata,
              };
            } catch (error) {
              logger.warn(`Error getting metadata for asset ${file.key}:`, error);
              return {
                fileKey: file.key,
                size: file.size,
                lastModified: file.lastModified,
              };
            }
          })
      );
      
      logger.info('Assets listed', { 
        prefix, 
        assetType, 
        count: assets.length,
      });
      
      // Return standardized response
      return {
        assets,
        prefix,
        isTruncated: result.isTruncated,
        nextContinuationToken: result.nextContinuationToken,
        count: assets.length,
      };
    } catch (error) {
      logger.error('Error listing assets:', error);
      throw error;
    }
  }
  
  /**
   * Generates a unique asset ID
   * @returns {string} - Unique asset ID
   * @private
   */
  _generateAssetId() {
    return `asset-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }
  
  /**
   * Generates a unique temporary ID
   * @returns {string} - Unique temporary ID
   * @private
   */
  _generateTempId() {
    return `temp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }
  
  /**
   * Generates a file key for an asset
   * @param {string} assetId - Asset ID
   * @param {string} fileName - Original file name
   * @param {string} assetType - Type of asset
   * @returns {string} - S3 object key
   * @private
   */
  _generateAssetKey(assetId, fileName, assetType) {
    // Extract file extension
    const extension = path.extname(fileName).toLowerCase();
    
    // Generate a sanitized base name
    const baseName = path.basename(fileName, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Combine into a well-organized key
    return `${this.prefixes.assets}${assetType}/${assetId}/${baseName}${extension}`;
  }
  
  /**
   * Generates a file key for a thumbnail
   * @param {string} assetId - Asset ID
   * @param {string} thumbnailType - Type of thumbnail
   * @returns {string} - S3 object key
   * @private
   */
  _generateThumbnailKey(assetId, thumbnailType) {
    return `${this.prefixes.thumbnails}${assetId}/${thumbnailType}.jpg`;
  }
  
  /**
   * Finds an asset key by asset ID
   * @param {string} assetId - Asset ID
   * @returns {Promise<string|null>} - S3 object key or null if not found
   * @private
   */
  async _findAssetKeyById(assetId) {
    try {
      // List all files with the asset ID prefix
      const result = await this.s3Client.listFiles({
        prefix: `${this.prefixes.assets}`,
        bucket: this.buckets.assets,
        maxKeys: 1000,
      });
      
      // Find files with matching asset-id in metadata
      for (const file of result.files) {
        try {
          const metadata = await this.s3Client.getFileMetadata({
            key: file.key,
            bucket: this.buckets.assets,
          });
          
          if (metadata.metadata['asset-id'] === assetId) {
            return file.key;
          }
        } catch (error) {
          // Skip files with errors
          continue;
        }
      }
      
      // If not found, return null
      return null;
    } catch (error) {
      logger.error(`Error finding asset key for ID ${assetId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
let storageServiceInstance = null;

/**
 * Gets the StorageService singleton instance
 * @returns {StorageService} - StorageService instance
 */
function getStorageService() {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}

module.exports = {
  getStorageService,
  StorageService,
};