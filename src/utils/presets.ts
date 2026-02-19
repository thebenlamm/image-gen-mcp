import { ProcessingOperation } from './processing.js';

export type AssetType = 'profile_pic' | 'post_image' | 'hero_photo' | 'avatar' | 'scene' | 'avery_8293' | 'avery_5160' | 'avery_22830' | 'avery_8164';

export interface AssetPreset {
  assetType: AssetType;
  description: string;
  generationSize: 'square' | 'landscape' | 'portrait';
  operations: ProcessingOperation[];
}

export const ASSET_PRESETS: Record<AssetType, AssetPreset> = {
  profile_pic: {
    assetType: 'profile_pic',
    description: 'Profile picture with circular mask (200x200)',
    generationSize: 'square',
    operations: [
      { type: 'aspectCrop', ratio: '1:1' },
      { type: 'circleMask' },
      { type: 'resize', width: 200, height: 200 },
    ],
  },
  post_image: {
    assetType: 'post_image',
    description: 'Social media post image (1200x675, 16:9)',
    generationSize: 'landscape',
    operations: [
      { type: 'aspectCrop', ratio: '16:9' },
      { type: 'resize', width: 1200, height: 675 },
    ],
  },
  hero_photo: {
    assetType: 'hero_photo',
    description: 'Vertical hero photo (1080x1920, 9:16)',
    generationSize: 'portrait',
    operations: [
      { type: 'aspectCrop', ratio: '9:16' },
      { type: 'resize', width: 1080, height: 1920, withoutEnlargement: true },
    ],
  },
  avatar: {
    assetType: 'avatar',
    description: 'Small avatar with circular mask (80x80)',
    generationSize: 'square',
    operations: [
      { type: 'aspectCrop', ratio: '1:1' },
      { type: 'circleMask' },
      { type: 'resize', width: 80, height: 80 },
    ],
  },
  scene: {
    assetType: 'scene',
    description: 'Scene image (1200x675, 16:9)',
    generationSize: 'landscape',
    operations: [
      { type: 'aspectCrop', ratio: '16:9' },
      { type: 'resize', width: 1200, height: 675 },
    ],
  },
  avery_8293: {
    assetType: 'avery_8293',
    description: 'Avery 8293 round label (1.5" diameter, 450x450 circular)',
    generationSize: 'square',
    operations: [
      { type: 'aspectCrop', ratio: '1:1' },
      { type: 'circleMask' },
      { type: 'resize', width: 450, height: 450 },
    ],
  },
  avery_5160: {
    assetType: 'avery_5160',
    description: 'Avery 5160 address label (2.625" x 1", 788x300)',
    generationSize: 'landscape',
    operations: [
      { type: 'resize', width: 788, height: 300, fit: 'cover' },
    ],
  },
  avery_22830: {
    assetType: 'avery_22830',
    description: 'Avery 22830 large round sticker (2.5" diameter, 750x750 circular)',
    generationSize: 'square',
    operations: [
      { type: 'aspectCrop', ratio: '1:1' },
      { type: 'circleMask' },
      { type: 'resize', width: 750, height: 750 },
    ],
  },
  avery_8164: {
    assetType: 'avery_8164',
    description: 'Avery 8164 shipping label (3.333" x 4", 1000x1200)',
    generationSize: 'portrait',
    operations: [
      { type: 'aspectCrop', ratio: '3:4' },
      { type: 'resize', width: 1000, height: 1200 },
    ],
  },
};

export function getPreset(assetType: AssetType): AssetPreset | undefined {
  return ASSET_PRESETS[assetType];
}
