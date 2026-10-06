import { useMemo, useState } from 'react';
import { View, Image, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { X } from 'lucide-react-native';
import { useSignedUrl, type PickedImage } from '@/lib/media';
import type { MessageAttachment } from '@/lib/cognition';
import { Radius, Spacing, type ExtendedThemeColors } from '@/lib/theme';

export function readAttachments(metadata: Record<string, unknown> | null | undefined): MessageAttachment[] {
  const raw = metadata?.attachments;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is MessageAttachment => !!a && typeof a.path === 'string' && typeof a.mime_type === 'string',
  );
}

function StoredImage({ path, size, colors: c, onOpen }: {
  path: string; size: number; colors: ExtendedThemeColors; onOpen: (url: string) => void;
}) {
  const url = useSignedUrl('chat-media', path);
  return (
    <TouchableOpacity
      disabled={!url}
      onPress={() => url && onOpen(url)}
      style={[styles.imageFrame, { width: size, height: size, backgroundColor: c.neutral[800] }]}
      accessibilityLabel="Open image"
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.fill} resizeMode="cover" />
      ) : (
        <ActivityIndicator color={c.primary[400]} />
      )}
    </TouchableOpacity>
  );
}

export function MessageImages({ attachments, colors: c }: { attachments: MessageAttachment[]; colors: ExtendedThemeColors }) {
  const { width, height } = useWindowDimensions();
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const size = attachments.length === 1 ? Math.min(260, width * 0.6) : Math.min(124, width * 0.3);
  const previewSize = Math.min(width - Spacing.lg * 2, height - 160, 900);

  if (!attachments.length) return null;
  return (
    <>
      <View style={styles.grid}>
        {attachments.map((a) => (
          <StoredImage key={a.path} path={a.path} size={size} colors={c} onOpen={setOpenUrl} />
        ))}
      </View>
      <Modal visible={!!openUrl} transparent animationType="fade" onRequestClose={() => setOpenUrl(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setOpenUrl(null)}>
          {openUrl && (
            <Image source={{ uri: openUrl }} style={{ width: previewSize, height: previewSize, borderRadius: Radius.md }} resizeMode="contain" />
          )}
          <View style={[styles.closeButton, { backgroundColor: c.neutral[900] }]}>
            <X color={c.neutral[100]} size={22} />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export function PendingAttachments({ images, onRemove, colors: c, disabled }: {
  images: PickedImage[]; onRemove: (index: number) => void; colors: ExtendedThemeColors; disabled: boolean;
}) {
  const themed = useMemo(() => ({
    strip: { borderTopColor: c.neutral[800], backgroundColor: c.neutral[900] },
    remove: { backgroundColor: c.neutral[950], borderColor: c.neutral[700] },
  }), [c]);

  if (!images.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.strip, themed.strip]} contentContainerStyle={styles.stripContent}>
      {images.map((img, index) => (
        <View key={`${img.uri}-${index}`} style={styles.pending}>
          <Image source={{ uri: img.uri }} style={styles.pendingImage} />
          <TouchableOpacity
            style={[styles.removeButton, themed.remove]}
            onPress={() => onRemove(index)}
            disabled={disabled}
            accessibilityLabel="Remove photo"
          >
            <X color={c.neutral[100]} size={14} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  imageFrame: { borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { width: '100%', height: '100%' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  closeButton: { position: 'absolute', top: Spacing.xl, right: Spacing.lg, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  strip: { borderTopWidth: 1, maxWidth: 800, alignSelf: 'center', width: '100%', flexGrow: 0 },
  stripContent: { gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  pending: { width: 64, height: 64 },
  pendingImage: { width: 64, height: 64, borderRadius: Radius.md },
  removeButton: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
