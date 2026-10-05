import { useEffect, useState } from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

const BUCKET = 'companion-portraits';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const DEFAULT_PORTRAIT = '/lumen-portrait.webp';

export const BUILT_IN_PORTRAITS: Array<{ label: string; path: string; source: ImageSourcePropType }> = [
  { label: 'Original', path: '/lumen-portrait.webp', source: require('../public/lumen-portrait.webp') },
  { label: 'Solar', path: '/lumen-portrait-solar.webp', source: require('../public/lumen-portrait-solar.webp') },
  { label: 'Tide', path: '/lumen-portrait-tide.webp', source: require('../public/lumen-portrait-tide.webp') },
  { label: 'Ember', path: '/lumen-portrait-ember.webp', source: require('../public/lumen-portrait-ember.webp') },
];

export function isUploadedPortrait(path: string | null | undefined): path is string {
  return !!path && !path.startsWith('/');
}

function builtInSource(path: string | null | undefined): ImageSourcePropType {
  const match = BUILT_IN_PORTRAITS.find((p) => p.path === path) ?? BUILT_IN_PORTRAITS[0];
  return match.source;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class PortraitUploadError extends Error {}

export async function pickAndUploadPortrait(userId: string): Promise<string | null> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new PortraitUploadError('Photo access is needed to choose a portrait.');
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const extension = ALLOWED_TYPES[mimeType];
  if (!extension) {
    throw new PortraitUploadError('Please choose a JPG, PNG, WebP or GIF image.');
  }
  if (!asset.base64) {
    throw new PortraitUploadError('Could not read that image. Please try another one.');
  }

  const bytes = base64ToBytes(asset.base64);
  if (bytes.byteLength > MAX_BYTES) {
    throw new PortraitUploadError('That image is too large. Please choose one under 5 MB.');
  }

  const path = `${userId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType });
  if (error) {
    console.error('portrait upload failed', error);
    throw new PortraitUploadError('Could not upload your photo. Please try again.');
  }
  return path;
}

export async function deleteUploadedPortrait(path: string | null | undefined) {
  if (!isUploadedPortrait(path)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('portrait cleanup failed', error);
}

export function usePortraitSource(path: string | null | undefined): ImageSourcePropType {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isUploadedPortrait(path)) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          console.error('portrait link failed', error);
          setSignedUrl(null);
          return;
        }
        setSignedUrl(data.signedUrl);
      });
    return () => { cancelled = true; };
  }, [path]);

  if (isUploadedPortrait(path) && signedUrl) return { uri: signedUrl };
  return builtInSource(isUploadedPortrait(path) ? DEFAULT_PORTRAIT : path);
}
