import { ProcessingOperation } from './processing.js';

export type AssetType = 'profile_pic' | 'post_image' | 'hero_photo' | 'avatar' | 'scene';

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
};

export function getPreset(assetType: AssetType): AssetPreset | undefined {
  return ASSET_PRESETS[assetType];
}
