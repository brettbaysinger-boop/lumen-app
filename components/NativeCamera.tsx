import { useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '@/lib/theme-context';
import type { PickedImage } from '@/lib/media';
interface Props { onCapture: (image: PickedImage) => void; onClose: () => void }
export default function NativeCamera({ onCapture, onClose }: Props) {
  const { colors: c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const capture = async () => {
    if (!ready || busy) return; setBusy(true);
    try { const photo = await camera.current?.takePictureAsync({ base64: true, quality: .85 }); if (!photo?.base64) throw new Error('No image'); onCapture({ uri: photo.uri, base64: photo.base64, mimeType: 'image/jpeg' }); onClose(); }
    catch { setError('Could not capture the photo. Try again.'); }
    finally { setBusy(false); }
  };
  if (!permission?.granted) return <Pressable onPress={() => void requestPermission()}><Text style={{ color: c.primary[300], padding: 24 }}>Allow camera access</Text></Pressable>;
  return <View style={{ gap: 16 }}><CameraView ref={camera} facing={facing} style={{ height: 360, borderRadius: 16 }} onCameraReady={() => setReady(true)} onMountError={() => setError('Could not start this camera.')} />
    {!!error && <Text style={{ color: c.error[300] }}>{error}</Text>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Pressable disabled={busy} onPress={() => { setReady(false); setFacing(old => old === 'front' ? 'back' : 'front'); }}><Text style={{ color: c.neutral[300] }}>Switch camera</Text></Pressable><Pressable disabled={!ready || busy} onPress={() => void capture()}><Text style={{ color: c.primary[300] }}>{busy ? 'Capturing…' : 'Take photo'}</Text></Pressable></View>
  </View>;
}
