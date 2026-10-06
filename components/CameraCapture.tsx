import { createElement, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { useTheme } from '@/lib/theme-context';
import type { PickedImage } from '@/lib/media';

const NativeCamera = lazy(() => import('./NativeCamera'));
interface Props { onCapture: (image: PickedImage) => void; onClose: () => void }
function WebCamera({ onCapture, onClose }: Props) {
  const { colors: c } = useTheme();
  const video = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  useEffect(() => {
    let active = true, stream: MediaStream | null = null;
    setReady(false); setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access needs HTTPS or localhost. You can still attach a photo from your files.'); return; }
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false }).then(async value => {
      if (!active) { value.getTracks().forEach(track => track.stop()); return; }
      stream = value;
      if (video.current) { video.current.srcObject = value; await video.current.play(); if (active) setReady(true); }
    }).catch(() => { if (active) setError('Could not open the camera. Check camera permission, or attach a photo instead.'); });
    return () => { active = false; stream?.getTracks().forEach(track => track.stop()); if (video.current) video.current.srcObject = null; };
  }, [facing]);
  const capture = () => {
    if (!video.current?.videoWidth || !ready) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.current.videoWidth; canvas.height = video.current.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No canvas');
      context.drawImage(video.current, 0, 0);
      const uri = canvas.toDataURL('image/jpeg', .85);
      onCapture({ uri, base64: uri.split(',')[1], mimeType: 'image/jpeg' }); onClose();
    } catch { setError('Could not capture the photo. Try again.'); }
  };
  return <View style={{ gap: 16 }}>
    {createElement('video', { ref: video, autoPlay: true, muted: true, playsInline: true, 'aria-label': 'Camera preview', style: { width: '100%', maxHeight: '55vh', borderRadius: 16, background: '#000', objectFit: 'contain' } })}
    {!!error && <Text accessibilityRole="alert" style={{ color: c.error[300] }}>{error}</Text>}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Pressable disabled={!ready} onPress={() => setFacing(old => old === 'user' ? 'environment' : 'user')}><Text style={{ color: c.neutral[300] }}>Switch camera</Text></Pressable><Pressable accessibilityRole="button" disabled={!ready} onPress={capture}><Text style={{ color: ready ? c.primary[300] : c.neutral[500] }}>Take photo</Text></Pressable></View>
  </View>;
}
export function CameraCapture(props: Props) {
  const { colors: c } = useTheme();
  return <Modal visible transparent animationType="fade" onRequestClose={props.onClose}><View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.8)', justifyContent: 'center', padding: 20 }}><View style={{ backgroundColor: c.neutral[900], padding: 20, borderRadius: 20, maxWidth: 640, width: '100%', alignSelf: 'center', gap: 20 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: c.neutral[100], fontSize: 22 }}>Share what’s in front of you</Text><Pressable accessibilityLabel="Close camera" onPress={props.onClose}><Text style={{ color: c.neutral[300] }}>Close</Text></Pressable></View>
    {Platform.OS === 'web' ? <WebCamera {...props} /> : <Suspense fallback={<Text style={{ color: c.neutral[300] }}>Starting camera…</Text>}><NativeCamera {...props} /></Suspense>}
    <Text style={{ color: c.neutral[400], fontSize: 11 }}>Your photo goes into the draft. It’s sent only when you press Send.</Text>
  </View></View></Modal>;
}
