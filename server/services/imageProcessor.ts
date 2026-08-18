import sharp from 'sharp';
import crypto from 'crypto';

// Strict memory limit settings for Sharp to prevent OOM container crashes on 5000+ batch uploads
sharp.cache(false);
sharp.concurrency(1);
sharp.simd(true);

export interface ProcessedImageResult {
  buffer: Buffer;
  thumbnailBuffer: Buffer;
  mimeType: string;
  extension: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  checksum: string;
  format: string;
  wasCompressed: boolean;
  compressionRatio: number;
}

export interface ProcessingOptions {
  targetSizeBytes?: number; // default 2MB (2 * 1024 * 1024)
  initialQuality?: number; // default 82
  outputFormat?: 'keep' | 'jpeg' | 'webp' | 'png' | 'avif';
}

export class ImageProcessor {
  /**
   * Calculates SHA-256 checksum of raw file buffer
   */
  public static calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Ultra-fast, single/two-pass memory-safe compression targeting <= targetSizeBytes
   */
  public static async processImage(
    inputBuffer: Buffer,
    originalFilename: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedImageResult> {
    const targetSizeBytes = options.targetSizeBytes || 2 * 1024 * 1024; // 2 MB limit
    const originalSize = inputBuffer.length;
    const checksum = this.calculateChecksum(inputBuffer);

    // Fast metadata extraction
    const imageInstance = sharp(inputBuffer);
    const metadata = await imageInstance.metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 1200;
    const formatStr = (metadata.format || 'jpeg').toString().toLowerCase();

    // Output format determination
    let targetFormat: 'jpeg' | 'webp' | 'png' | 'avif' = 'jpeg';
    if (formatStr === 'svg') {
      // Return SVG directly with SVG thumbnail or direct buffer
      return {
        buffer: inputBuffer,
        thumbnailBuffer: inputBuffer,
        mimeType: 'image/svg+xml',
        extension: 'svg',
        originalSize,
        compressedSize: originalSize,
        width: 800,
        height: 800,
        checksum,
        format: 'svg',
        wasCompressed: false,
        compressionRatio: 0
      };
    }

    if (options.outputFormat === 'keep' || !options.outputFormat) {
      if (formatStr === 'png') targetFormat = 'png';
      else if (formatStr === 'webp') targetFormat = 'webp';
      else if (formatStr === 'avif') targetFormat = 'avif';
      else targetFormat = 'jpeg';
    } else {
      targetFormat = options.outputFormat as any;
    }

    const mimeType = `image/${targetFormat === 'jpeg' ? 'jpeg' : targetFormat}`;
    const extension = targetFormat === 'jpeg' ? 'jpg' : targetFormat;

    let outputBuffer = inputBuffer;
    let wasCompressed = false;

    // If file is already <= targetSizeBytes and format is keep, skip re-encoding for maximum speed & zero CPU waste
    if (originalSize <= targetSizeBytes && (options.outputFormat === 'keep' || !options.outputFormat) && (formatStr === targetFormat || (formatStr === 'jpeg' && targetFormat === 'jpeg'))) {
      outputBuffer = inputBuffer;
    } else {
      // Pass 1: Direct high-efficiency compression
      const quality = options.initialQuality || 82;
      let pipeline = sharp(inputBuffer);

      // Cap max dimension to 3840px (4K) to prevent memory ballooning
      if (width > 3840 || height > 3840) {
        pipeline = pipeline.resize(3840, 3840, { fit: 'inside', withoutEnlargement: true });
      }

      if (targetFormat === 'jpeg') {
        pipeline = pipeline.jpeg({ quality, mozjpeg: false });
      } else if (targetFormat === 'webp') {
        pipeline = pipeline.webp({ quality, effort: 2 });
      } else if (targetFormat === 'png') {
        pipeline = pipeline.png({ compressionLevel: 7 });
      } else if (targetFormat === 'avif') {
        pipeline = pipeline.avif({ quality, effort: 2 });
      }

      let candidate = await pipeline.toBuffer();

      // Pass 2 (Only if still > targetSizeBytes): Smart proportional resize + 72 quality
      if (candidate.length > targetSizeBytes) {
        let fallbackPipeline = sharp(inputBuffer);
        const maxDim = Math.min(width, 2400);
        fallbackPipeline = fallbackPipeline.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });

        if (targetFormat === 'jpeg') {
          fallbackPipeline = fallbackPipeline.jpeg({ quality: 72, mozjpeg: false });
        } else if (targetFormat === 'webp') {
          fallbackPipeline = fallbackPipeline.webp({ quality: 72, effort: 2 });
        } else if (targetFormat === 'png') {
          fallbackPipeline = fallbackPipeline.png({ compressionLevel: 8 });
        } else {
          fallbackPipeline = fallbackPipeline.avif({ quality: 70, effort: 2 });
        }

        candidate = await fallbackPipeline.toBuffer();
      }

      outputBuffer = candidate;
      wasCompressed = true;
    }

    // Fast Thumbnail Generation (280x280 webp, high speed, effort 1)
    let thumbnailBuffer: Buffer;
    try {
      thumbnailBuffer = await sharp(outputBuffer)
        .resize(280, 280, { fit: 'cover', position: 'center' })
        .webp({ quality: 65, effort: 1 })
        .toBuffer();
    } catch (e) {
      // Fallback to outputBuffer if thumbnail generation encounters any error
      thumbnailBuffer = outputBuffer;
    }


    const compressedSize = outputBuffer.length;
    const compressionRatio = originalSize > 0 ? Number((((originalSize - compressedSize) / originalSize) * 100).toFixed(1)) : 0;

    return {
      buffer: outputBuffer,
      thumbnailBuffer,
      mimeType,
      extension,
      originalSize,
      compressedSize,
      width,
      height,
      checksum,
      format: targetFormat,
      wasCompressed,
      compressionRatio: compressionRatio > 0 ? compressionRatio : 0
    };
  }
}

