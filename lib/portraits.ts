import type { ImageSourcePropType } from 'react-native';
import { pickImages, removeStoredFiles, uploadImage, useSignedUrl } from '@/lib/media';

const BUCKET = 'companion-portraits';
const MAX_BYTES = 5 * 1024 * 1024;

export const DEFAULT_PORTRAIT = '/lumen-original.jpg';

export const BUILT_IN_PORTRAITS: Array<{ label: string; path: string; source: ImageSourcePropType }> = [
  { label: 'Lumen', path: '/lumen-original.jpg', source: require('../public/lumen-original.jpg') },
  { label: 'Classic', path: '/lumen-portrait.webp', source: require('../public/lumen-portrait.webp') },
  { label: 'Solar', path: '/lumen-portrait-solar.webp', source: require('../public/lumen-portrait-solar.webp') },
  { label: 'Tide', path: '/lumen-portrait-tide.webp', source: require('../public/lumen-portrait-tide.webp') },
  { label: 'Ember', path: '/lumen-portrait-ember.webp', source: require('../public/lumen-portrait-ember.webp') },
];

function isUploadedPortrait(path: string | null | undefined): path is string {
  return !!path && !path.startsWith('/');
}

function builtInSource(path: string | null | undefined): ImageSourcePropType {
  const match = BUILT_IN_PORTRAITS.find((p) => p.path === path) ?? BUILT_IN_PORTRAITS[0];
  return match.source;
}

export async function pickAndUploadPortrait(userId: string): Promise<string | null> {
  const [image] = await pickImages({ square: true });
  if (!image) return null;
  return uploadImage(BUCKET, userId, image, MAX_BYTES);
}

export async function deleteUploadedPortrait(path: string | null | undefined) {
  if (isUploadedPortrait(path)) await removeStoredFiles(BUCKET, [path]);
}

export function usePortraitSource(path: string | null | undefined): ImageSourcePropType {
  const signedUrl = useSignedUrl(BUCKET, isUploadedPortrait(path) ? path : null);
  if (isUploadedPortrait(path)) return signedUrl ? { uri: signedUrl } : builtInSource(DEFAULT_PORTRAIT);
  return builtInSource(path);
}
