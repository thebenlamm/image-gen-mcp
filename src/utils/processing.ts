import sharp from 'sharp';

// Operation type union — each operation is a tagged object
type ResizeOp = {
  type: 'resize';
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'fill';
  withoutEnlargement?: boolean;
};

type CropOp = {
  type: 'crop';
  x: number;
  y: number;
  width: number;
  height: number
};

type AspectCropOp = {
  type: 'aspectCrop';
  ratio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  gravity?: 'center' | 'north' | 'south' | 'east' | 'west'
};

type CircleMaskOp = {
  type: 'circleMask'
};

export type ProcessingOperation = ResizeOp | CropOp | AspectCropOp | CircleMaskOp;

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  channels: number;
}

export interface ProcessingResult {
  buffer: Buffer;
  originalInfo: ImageInfo;
  outputInfo: ImageInfo;
  operationsApplied: string[];
}

/**
 * Extract metadata from an image buffer
 */
export async function getImageInfo(buffer: Buffer): Promise<ImageInfo> {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || width <= 0 || !height || height <= 0) {
    throw new Error(`Invalid image metadata: width=${width}, height=${height}. Image may be corrupt.`);
  }
  return {
    width,
    height,
    format: metadata.format || 'unknown',
    channels: metadata.channels || 0,
  };
}

/**
 * Resize an image with optional fit mode
 */
export async function resize(buffer: Buffer, op: ResizeOp): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: op.width,
      height: op.height,
      fit: op.fit || 'cover',
      withoutEnlargement: op.withoutEnlargement,
    })
    .png()
    .toBuffer();
}

/**
 * Extract a rectangular region from an image
 */
export async function crop(buffer: Buffer, op: CropOp): Promise<Buffer> {
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (sourceWidth && sourceHeight) {
    if (op.x + op.width > sourceWidth || op.y + op.height > sourceHeight) {
      throw new Error(
        `Crop region (${op.x},${op.y} ${op.width}x${op.height}) exceeds source dimensions (${sourceWidth}x${sourceHeight})`
      );
    }
  }

  return sharp(buffer)
    .extract({
      left: op.x,
      top: op.y,
      width: op.width,
      height: op.height,
    })
    .png()
    .toBuffer();
}

/**
 * Crop an image to a standard aspect ratio with gravity control
 */
export async function aspectCrop(buffer: Buffer, op: AspectCropOp): Promise<Buffer> {
  // Parse ratio string to get target aspect (e.g., '16:9' → 16/9)
  const [widthRatio, heightRatio] = op.ratio.split(':').map(Number);
  const targetAspect = widthRatio / heightRatio;

  // Get source dimensions
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || sourceWidth <= 0 || !sourceHeight || sourceHeight <= 0) {
    throw new Error(`Cannot aspect crop: invalid source dimensions (${sourceWidth}x${sourceHeight})`);
  }
  const sourceAspect = sourceWidth / sourceHeight;

  // Calculate crop dimensions
  let cropWidth: number;
  let cropHeight: number;
  let left = 0;
  let top = 0;

  if (sourceAspect > targetAspect) {
    // Source is wider than target ratio: crop width (keep full height, adjust horizontally)
    cropHeight = sourceHeight;
    cropWidth = Math.round(cropHeight * targetAspect);

    // Apply gravity for horizontal positioning
    const gravity = op.gravity || 'center';
    if (gravity === 'center') {
      left = Math.round((sourceWidth - cropWidth) / 2);
    } else if (gravity === 'east') {
      left = sourceWidth - cropWidth;
    } else if (gravity === 'west') {
      left = 0;
    } else {
      // north/south don't affect horizontal crops
      left = Math.round((sourceWidth - cropWidth) / 2);
    }
  } else {
    // Source is taller than target ratio: crop height (keep full width, adjust vertically)
    cropWidth = sourceWidth;
    cropHeight = Math.round(cropWidth / targetAspect);

    // Apply gravity for vertical positioning
    const gravity = op.gravity || 'center';
    if (gravity === 'center') {
      top = Math.round((sourceHeight - cropHeight) / 2);
    } else if (gravity === 'north') {
      top = 0;
    } else if (gravity === 'south') {
      top = sourceHeight - cropHeight;
    } else {
      // east/west don't affect vertical crops
      top = Math.round((sourceHeight - cropHeight) / 2);
    }
  }

  return sharp(buffer)
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();
}

/**
 * Apply a circular mask to an image with transparent background
 */
export async function circleMask(buffer: Buffer): Promise<Buffer> {
  // Get source dimensions
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width;
  const sourceHeight = metadata.height;
  if (!sourceWidth || sourceWidth <= 0 || !sourceHeight || sourceHeight <= 0) {
    throw new Error(`Cannot apply circle mask: invalid source dimensions (${sourceWidth}x${sourceHeight})`);
  }

  // Use the smaller dimension as diameter
  const diameter = Math.min(sourceWidth, sourceHeight);
  const radius = diameter / 2;

  // First, crop/resize to square
  const squareBuffer = await sharp(buffer)
    .resize(diameter, diameter, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .toBuffer();

  // Create SVG circle mask
  const circleSvg = Buffer.from(
    `<svg width="${diameter}" height="${diameter}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>`
  );

  // Apply mask using dest-in blend mode (keeps only overlapping parts)
  return sharp(squareBuffer)
    .composite([{
      input: circleSvg,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();
}

/**
 * Apply a sequence of processing operations to an image
 */
export async function applyOperations(
  buffer: Buffer,
  operations: ProcessingOperation[]
): Promise<ProcessingResult> {
  // Get original image info
  const originalInfo = await getImageInfo(buffer);

  // Track applied operations
  const operationsApplied: string[] = [];

  // Apply each operation sequentially
  let currentBuffer = buffer;
  const total = operations.length;
  for (let i = 0; i < total; i++) {
    const operation = operations[i];
    try {
      switch (operation.type) {
        case 'resize': {
          currentBuffer = await resize(currentBuffer, operation);
          const sizeStr = `${operation.width || 'auto'}x${operation.height || 'auto'}`;
          const fitStr = operation.fit || 'cover';
          operationsApplied.push(`resize(${sizeStr}, ${fitStr})`);
          break;
        }

        case 'crop': {
          currentBuffer = await crop(currentBuffer, operation);
          operationsApplied.push(`crop(${operation.x},${operation.y},${operation.width}x${operation.height})`);
          break;
        }

        case 'aspectCrop': {
          currentBuffer = await aspectCrop(currentBuffer, operation);
          const gravityStr = operation.gravity || 'center';
          operationsApplied.push(`aspectCrop(${operation.ratio}, ${gravityStr})`);
          break;
        }

        case 'circleMask': {
          currentBuffer = await circleMask(currentBuffer);
          operationsApplied.push('circleMask');
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Operation ${i + 1}/${total} (${operation.type}) failed: ${message}`);
    }
  }

  // Get final image info
  const outputInfo = await getImageInfo(currentBuffer);

  return {
    buffer: currentBuffer,
    originalInfo,
    outputInfo,
    operationsApplied,
  };
}
