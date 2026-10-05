import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

export type MediaBucket = 'companion-portraits' | 'chat-media';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class MediaError extends Error {}

export interface PickedImage {
  uri: string;
  base64: string;
  mimeType: string;
}

export async function pickImages(options: { multiple?: boolean; square?: boolean; limit?: number }): Promise<PickedImage[]> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new MediaError('Photo access is needed to choose an image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: !!options.square && !options.multiple,
    aspect: options.square ? [1, 1] : undefined,
    allowsMultipleSelection: !!options.multiple,
    selectionLimit: options.limit ?? 1,
    quality: 0.85,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return [];

  return result.assets.map((asset) => {
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!EXTENSIONS[mimeType]) throw new MediaError('Please choose a JPG, PNG, WebP or GIF image.');
    if (!asset.base64) throw new MediaError('Could not read that image. Please try another one.');
    return { uri: asset.uri, base64: asset.base64, mimeType };
  });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadImage(
  bucket: MediaBucket,
  userId: string,
  image: PickedImage,
  maxBytes: number,
): Promise<string> {
  const bytes = base64ToBytes(image.base64);
  if (bytes.byteLength > maxBytes) {
    throw new MediaError(`That image is too large. Please choose one under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXTENSIONS[image.mimeType]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: image.mimeType });
  if (error) {
    console.error('image upload failed', error);
    throw new MediaError('Could not upload the image. Please try again.');
  }
  return path;
}

export async function removeStoredFiles(bucket: MediaBucket, paths: string[]) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) console.error('file cleanup failed', error);
}

export function useSignedUrl(bucket: MediaBucket, path: string | null | undefined): string | null {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          console.error('signed link failed', error);
          return;
        }
        setSigned({ path, url: data.signedUrl });
      });
    return () => { cancelled = true; };
  }, [bucket, path]);

  return path && signed?.path === path ? signed.url : null;
}
