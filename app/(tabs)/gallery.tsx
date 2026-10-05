import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  Image as RNImage,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, X, Trash2, Image as ImageIcon, Video, Sparkles } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { Spacing, Radius, Typography, type ExtendedThemeColors } from '@/lib/theme';
import type { Companion, GalleryItem, GalleryCategory } from '@/types/database';

const CATEGORIES: Array<{ key: GalleryCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'moment', label: 'Moments We Shared' },
  { key: 'user_showed', label: 'Things You Showed Me' },
  { key: 'companion_sent', label: 'Images I Sent Back' },
];

export default function GalleryScreen() {
  const { colors: c } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const numColumns = screenWidth < 600 ? 2 : 3;
  const styles = useMemo(() => createStyles(c), [c]);

  const [companion, setCompanion] = useState<Companion | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<GalleryCategory | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newCategory, setNewCategory] = useState<GalleryCategory>('moment');
  const [newMediaType, setNewMediaType] = useState<'image' | 'video'>('image');
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);

  const loadCompanion = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('companions').select('*')
      .order('created_at', { ascending: true }).order('id', { ascending: true })
      .limit(1).maybeSingle();
    if (err) { setError(err.message); setLoading(false); return; }
    if (data) setCompanion(data as Companion);
    setLoading(false);
  }, []);

  const loadItems = useCallback(async () => {
    if (!companion) return;
    let query = supabase.from('gallery_items').select('*')
      .eq('companion_id', companion.id).order('created_at', { ascending: false });
    if (filterCategory !== 'all') query = query.eq('category', filterCategory);
    const { data, error: err } = await query;
    if (err) { setError(err.message); return; }
    setItems((data as GalleryItem[]) || []);
  }, [companion, filterCategory]);

  useEffect(() => { loadCompanion(); }, [loadCompanion]);
  useEffect(() => { if (companion) loadItems(); }, [companion, loadItems]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await loadItems(); setRefreshing(false);
  }, [loadItems]);

  const addItem = useCallback(async () => {
    if (!companion || !newUrl.trim()) return;
    const { data, error: err } = await supabase
      .from('gallery_items').insert({
        companion_id: companion.id, source: 'user', category: newCategory,
        media_type: newMediaType, url: newUrl.trim(),
        caption: newCaption.trim() || null,
      }).select().single();
    if (err) { setError(err.message); return; }
    setItems((prev) => [data as GalleryItem, ...prev]);
    setNewUrl(''); setNewCaption(''); setShowAddModal(false);
  }, [companion, newUrl, newCaption, newCategory, newMediaType]);

  const deleteItem = useCallback(async (id: string) => {
    const { error: err } = await supabase.from('gallery_items').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPreviewItem(null);
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={c.primary[400]} />
      </SafeAreaView>
    );
  }

  const effectiveWidth = Math.min(screenWidth, 720);
  const cardSize = (effectiveWidth - Spacing.md * (numColumns + 1)) / numColumns;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Sparkles color={c.gold[400]} size={22} strokeWidth={2} />
          <Text style={styles.headerTitle}>Shared Gallery</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
          <Plus color={c.primary[400]} size={22} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.filterChip, filterCategory === cat.key && { backgroundColor: c.primary[600], borderColor: c.primary[500] }]}
              onPress={() => setFilterCategory(cat.key)}
            >
              <Text style={[styles.filterChipText, filterCategory === cat.key && { color: c.neutral[0] }]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={numColumns}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[400]} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { width: cardSize, height: cardSize }]}
            onPress={() => setPreviewItem(item)}
          >
            {item.media_type === 'image' ? (
              <RNImage source={{ uri: item.url }} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImage, styles.videoPlaceholder]}>
                <Video color={c.neutral[400]} size={32} strokeWidth={1.5} />
              </View>
            )}
            <View style={styles.cardOverlay}>
              <Text style={styles.cardCaption} numberOfLines={2}>{item.caption || ''}</Text>
            </View>
            {item.source === 'companion' && (
              <View style={styles.companionBadge}>
                <Sparkles color={c.gold[300]} size={10} strokeWidth={2} />
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <ImageIcon color={c.neutral[600]} size={48} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>Your gallery is empty</Text>
            <Text style={styles.emptySubtitle}>
              Share images and videos with {companion?.name || 'your companion'} to build your visual scrapbook together.
            </Text>
          </View>
        }
      />

      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Gallery</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <X color={c.neutral[400]} size={22} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} value={newUrl} onChangeText={setNewUrl}
              placeholder="Image or video URL..." placeholderTextColor={c.neutral[500]}
              autoCapitalize="none" autoFocus />
            <TextInput style={[styles.modalInput, { minHeight: 60 }]} value={newCaption} onChangeText={setNewCaption}
              placeholder="Caption (optional)..." placeholderTextColor={c.neutral[500]} multiline />
            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.typeSelector}>
              {CATEGORIES.filter((cat) => cat.key !== 'all').map((cat) => (
                <TouchableOpacity key={cat.key}
                  style={[styles.typeChip, newCategory === cat.key && { backgroundColor: c.primary[600] }]}
                  onPress={() => setNewCategory(cat.key as GalleryCategory)}>
                  <Text style={[styles.typeChipText, newCategory === cat.key && { color: c.neutral[0] }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Media type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity style={[styles.typeChip, newMediaType === 'image' && { backgroundColor: c.primary[600] }]} onPress={() => setNewMediaType('image')}>
                <ImageIcon color={newMediaType === 'image' ? c.neutral[0] : c.neutral[400]} size={14} strokeWidth={2} />
                <Text style={[styles.typeChipText, newMediaType === 'image' && { color: c.neutral[0] }]}>Image</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeChip, newMediaType === 'video' && { backgroundColor: c.primary[600] }]} onPress={() => setNewMediaType('video')}>
                <Video color={newMediaType === 'video' ? c.neutral[0] : c.neutral[400]} size={14} strokeWidth={2} />
                <Text style={[styles.typeChipText, newMediaType === 'video' && { color: c.neutral[0] }]}>Video</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.modalSaveButton, !newUrl.trim() && styles.modalSaveButtonDisabled]} onPress={addItem} disabled={!newUrl.trim()}>
              <Text style={styles.modalSaveText}>Add to Gallery</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!previewItem} transparent animationType="fade" onRequestClose={() => setPreviewItem(null)}>
        <TouchableOpacity style={styles.previewOverlay} activeOpacity={1} onPress={() => setPreviewItem(null)}>
          <View style={styles.previewContent}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewCaption}>{previewItem?.caption || 'Untitled'}</Text>
              <View style={styles.previewActions}>
                <TouchableOpacity onPress={() => previewItem && deleteItem(previewItem.id)} style={styles.previewDelete}>
                  <Trash2 color={c.error[400]} size={20} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPreviewItem(null)}>
                  <X color={c.neutral[300]} size={24} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
            {previewItem?.media_type === 'image' ? (
              <RNImage source={{ uri: previewItem.url }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <View style={[styles.previewImage, styles.videoPlaceholder]}>
                <Video color={c.neutral[400]} size={48} strokeWidth={1.5} />
              </View>
            )}
            <Text style={styles.previewDate}>
              {previewItem ? new Date(previewItem.created_at).toLocaleDateString() : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: ExtendedThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.neutral[950], overflow: 'hidden' },
    loadingContainer: { flex: 1, backgroundColor: c.neutral[950], alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, maxWidth: 720, alignSelf: 'center', width: '100%' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    headerTitle: { ...Typography.heading, color: c.neutral[100] },
    addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.neutral[800], alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.gold[500] },
    filterRow: { marginBottom: Spacing.sm, maxWidth: 720, alignSelf: 'center', width: '100%' },
    filterContent: { paddingHorizontal: Spacing.md, gap: Spacing.sm, maxWidth: 720, alignSelf: 'center', width: '100%' },
    filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.pill, backgroundColor: c.neutral[800], borderWidth: 1, borderColor: c.neutral[700] },
    filterChipText: { ...Typography.caption, fontFamily: 'Inter-Medium', color: c.neutral[400] },
    errorBanner: { marginHorizontal: Spacing.md, marginBottom: Spacing.sm, backgroundColor: c.error[900], paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md },
    errorText: { ...Typography.caption, color: c.error[200] },
    list: { padding: Spacing.md, paddingTop: 0, maxWidth: 720, alignSelf: 'center', width: '100%' },
    card: { borderRadius: Radius.md, marginBottom: Spacing.sm, overflow: 'hidden', backgroundColor: c.neutral[800], marginRight: Spacing.md, borderWidth: 1, borderColor: c.gold[800] },
    cardImage: { flex: 1, width: '100%' },
    cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: Spacing.xs + 2, paddingVertical: Spacing.xs + 2, backgroundColor: 'rgba(15,20,32,0.7)' },
    cardCaption: { ...Typography.small, color: c.neutral[200] },
    companionBadge: { position: 'absolute', top: Spacing.xs, right: Spacing.xs, width: 22, height: 22, borderRadius: 11, backgroundColor: c.neutral[950], alignItems: 'center', justifyContent: 'center' },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingTop: Spacing.xxl * 2, paddingHorizontal: Spacing.xl, gap: Spacing.md },
    emptyTitle: { ...Typography.subheading, color: c.neutral[400] },
    emptySubtitle: { ...Typography.body, color: c.neutral[600], textAlign: 'center', lineHeight: 22 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: Spacing.lg },
    modalContent: { backgroundColor: c.neutral[900], borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm, borderWidth: 1, borderColor: c.gold[800] },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    modalTitle: { ...Typography.subheading, color: c.neutral[100] },
    modalInput: { ...Typography.body, color: c.neutral[100], backgroundColor: c.neutral[800], borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, minHeight: 44 },
    modalLabel: { ...Typography.caption, color: c.neutral[400], fontFamily: 'Inter-SemiBold', marginTop: Spacing.xs },
    typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, backgroundColor: c.neutral[800], borderRadius: Radius.sm },
    typeChipText: { ...Typography.small, color: c.neutral[300] },
    modalSaveButton: { backgroundColor: c.primary[600], borderRadius: Radius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
    modalSaveButtonDisabled: { backgroundColor: c.neutral[700] },
    modalSaveText: { ...Typography.bodyMedium, color: c.neutral[0], fontFamily: 'Inter-SemiBold' },
    previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.md },
    previewContent: { backgroundColor: c.neutral[900], borderRadius: Radius.xl, padding: Spacing.md, borderWidth: 1, borderColor: c.gold[700] },
    previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
    previewCaption: { ...Typography.subheading, color: c.neutral[100], flex: 1 },
    previewActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    previewDelete: { padding: Spacing.xs },
    previewImage: { width: '100%', height: 400, borderRadius: Radius.md },
    previewDate: { ...Typography.caption, color: c.neutral[500], marginTop: Spacing.sm, textAlign: 'center' },
    videoPlaceholder: { backgroundColor: c.neutral[800], alignItems: 'center', justifyContent: 'center' },
  });
}
