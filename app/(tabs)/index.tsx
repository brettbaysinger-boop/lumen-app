import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Send,
  Sparkles,
  Mic,
  Image as ImageIcon,
  Plus,
  ChevronLeft,
  Volume2,
  Square,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { respondToMessage } from '@/lib/cognition';
import { recordMicrophone, transcribeRecording, playReply, type RecordingHandle } from '@/lib/voice';
import { Colors, Spacing, Radius, Typography } from '@/lib/theme';
import type { Companion, Conversation, Message } from '@/types/database';

export default function ChatScreen() {
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const flatListRef = useRef<FlatList<Message>>(null);
  const [voicePhase, setVoicePhase] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const voicePhaseRef = useRef(voicePhase);
  const recordingRef = useRef<RecordingHandle | null>(null);
  const voiceRequestRef = useRef<AbortController | null>(null);
  const playbackRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const draftRef = useRef(inputText);
  draftRef.current = inputText;
  const voiceBusy = voicePhase !== 'idle';
  const changeVoicePhase = useCallback((phase: typeof voicePhase) => {
    voicePhaseRef.current = phase;
    setVoicePhase(phase);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recordingRef.current?.cancel();
      voiceRequestRef.current?.abort();
      playbackRef.current?.abort();
    };
  }, []);

  useEffect(() => { playbackRef.current?.abort(); }, [activeConversation?.id]);

  const toggleRecording = useCallback(async () => {
    if (voicePhaseRef.current === 'recording') {
      recordingRef.current?.stop();
      return;
    }
    if (voicePhaseRef.current !== 'idle' || sending) return;
    playbackRef.current?.abort();
    setError(null);
    changeVoicePhase('starting');
    try {
      const handle = await recordMicrophone(async (blob) => {
        if (!mountedRef.current) return;
        recordingRef.current = null;
        changeVoicePhase('transcribing');
        const controller = new AbortController();
        voiceRequestRef.current = controller;
        try {
          const text = await transcribeRecording(blob, controller.signal);
          if (mountedRef.current && !controller.signal.aborted) {
            const draft = [draftRef.current.trim(), text].filter(Boolean).join(' ');
            if (draft.length > 4000) throw new Error('The draft is too long. Shorten it and record again.');
            setInputText(draft);
          }
        } catch (err) {
          if (mountedRef.current && !controller.signal.aborted) {
            setError(err instanceof Error ? err.message : 'Transcription failed.');
          }
        } finally {
          if (mountedRef.current) changeVoicePhase('idle');
          voiceRequestRef.current = null;
        }
      }, (err) => {
        if (mountedRef.current) { setError(err.message); changeVoicePhase('idle'); }
      });
      if (!mountedRef.current) { handle.cancel(); return; }
      recordingRef.current = handle;
      changeVoicePhase('recording');
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Could not access the microphone.');
        changeVoicePhase('idle');
      }
    }
  }, [sending, changeVoicePhase]);

  const togglePlayback = useCallback(async (message: Message) => {
    const stopping = playingId === message.id;
    playbackRef.current?.abort();
    if (stopping) { setPlayingId(null); return; }
    if (voicePhaseRef.current !== 'idle') return;
    const controller = new AbortController();
    playbackRef.current = controller;
    setPlayingId(message.id);
    setError(null);
    const finished = () => {
      if (mountedRef.current && playbackRef.current === controller) setPlayingId(null);
    };
    try {
      await playReply(message.content, controller.signal, finished);
    } catch (err) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Playback failed.');
        finished();
      }
    }
  }, [playingId]);

  const loadCompanion = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('companions')
      .select('*')
      .limit(1)
      .maybeSingle();
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (data) {
      setCompanion(data as Companion);
      await loadConversations(data.id);
    }
    setLoading(false);
  }, []);

  const loadConversations = useCallback(async (companionId: string) => {
    const { data, error: err } = await supabase
      .from('conversations')
      .select('*')
      .eq('companion_id', companionId)
      .order('last_message_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    if (data) {
      setConversations(data as Conversation[]);
      if (data.length > 0 && !activeConversation) {
        setActiveConversation(data[0] as Conversation);
      }
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      return;
    }
    setMessages((data as Message[]) || []);
  }, []);

  useEffect(() => {
    loadCompanion();
  }, [loadCompanion]);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
    } else {
      setMessages([]);
    }
  }, [activeConversation, loadMessages]);

  const createConversation = useCallback(async () => {
    if (!companion || sending || voicePhaseRef.current !== 'idle') return;
    const { data, error: err } = await supabase
      .from('conversations')
      .insert({
        companion_id: companion.id,
        title: 'New Conversation',
        is_active: true,
      })
      .select()
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    const newConv = data as Conversation;
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversation(newConv);
    setShowSidebar(false);
  }, [companion, sending]);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !companion || sending || voicePhaseRef.current !== 'idle') return;
    playbackRef.current?.abort();

    const text = inputText.trim();
    setInputText('');
    setSending(true);
    Keyboard.dismiss();

    setError(null);
    try {
      const response = await respondToMessage(companion.id, activeConversation?.id ?? null, text);
      const { data, error: refreshError } = await supabase
        .from('conversations')
        .select('*')
        .eq('companion_id', companion.id)
        .order('last_message_at', { ascending: false });
      if (refreshError) {
        setError(`Reply received, but conversation refresh failed: ${refreshError.message}`);
      } else {
        setConversations((data as Conversation[]) || []);
        const conversation = data?.find((item) => item.id === response.conversation_id);
        if (conversation) setActiveConversation(conversation as Conversation);
      }
      await loadMessages(response.conversation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lumen could not respond.');
      setInputText(text);
    } finally {
      setSending(false);
    }
  }, [inputText, companion, sending, activeConversation, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={Colors.primary[400]} />
        <Text style={styles.loadingText}>Connecting to companion...</Text>
      </SafeAreaView>
    );
  }

  if (error && !companion) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setShowSidebar(true)}
        >
          <Plus color={Colors.neutral[200]} size={22} strokeWidth={2} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.avatarDot} />
          <Text style={styles.headerName}>{companion?.name || 'Companion'}</Text>
        </View>
        <View style={styles.headerStatus}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{sending ? 'Thinking...' : 'Ready'}</Text>
        </View>
      </View>

      {showSidebar && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowSidebar(false)}
        >
          <View style={styles.sidebar}>
            <View style={styles.sidebarHeader}>
              <TouchableOpacity onPress={() => setShowSidebar(false)}>
                <ChevronLeft color={Colors.neutral[200]} size={24} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.sidebarTitle}>Conversations</Text>
            </View>
            <TouchableOpacity style={styles.newChatButton} onPress={createConversation} disabled={sending || voiceBusy}>
              <Plus color={Colors.primary[400]} size={20} strokeWidth={2} />
              <Text style={styles.newChatText}>New Conversation</Text>
            </TouchableOpacity>
            <FlatList
              data={conversations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.conversationItem,
                    activeConversation?.id === item.id && styles.conversationItemActive,
                  ]}
                  disabled={sending || voiceBusy}
                  onPress={() => {
                    setActiveConversation(item);
                    setShowSidebar(false);
                  }}
                >
                  <Text
                    style={[
                      styles.conversationTitle,
                      activeConversation?.id === item.id && styles.conversationTitleActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.conversationDate}>
                    {new Date(item.last_message_at).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptySidebarText}>No conversations yet</Text>
              }
            />
          </View>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageWrapper,
              item.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAI,
            ]}
          >
            {item.role === 'assistant' && (
              <View style={styles.messageAvatar}>
                <Sparkles color={Colors.primary[300]} size={16} strokeWidth={2} />
              </View>
            )}
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleAI,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  item.role === 'user' ? styles.messageTextUser : styles.messageTextAI,
                ]}
              >
                {item.content}
              </Text>
              {item.role === 'assistant' && Platform.OS === 'web' && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
                  onPress={() => togglePlayback(item)}
                  disabled={voiceBusy}
                  accessibilityLabel={playingId === item.id ? 'Stop reply audio' : 'Play reply audio'}
                >
                  {playingId === item.id
                    ? <Square color={Colors.primary[300]} size={16} />
                    : <Volume2 color={Colors.primary[300]} size={16} />}
                  <Text style={{ color: Colors.primary[300], fontSize: 12 }}>
                    {playingId === item.id ? 'Stop audio' : 'Play reply'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <View style={styles.emptyChatIcon}>
              <Sparkles color={Colors.primary[400]} size={40} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyChatTitle}>
              {companion?.name || 'Your companion'} is here
            </Text>
            <Text style={styles.emptyChatSubtitle}>
              {companion?.persona || 'Start a conversation to begin your journey together.'}
            </Text>
          </View>
        }
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}
      {voiceBusy && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            {voicePhase === 'recording' ? 'Recording — tap Stop when finished (60 seconds maximum).'
              : voicePhase === 'transcribing' ? 'Transcribing on Helios…'
              : 'Waiting for microphone permission…'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.inputButton} disabled>
            <ImageIcon color={Colors.neutral[500]} size={22} strokeWidth={2} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message your companion..."
            placeholderTextColor={Colors.neutral[500]}
            multiline
            maxLength={4000}
            editable={!sending && !voiceBusy}
          />
          <TouchableOpacity
            style={styles.inputButton}
            onPress={toggleRecording}
            disabled={Platform.OS !== 'web' || sending || voicePhase === 'starting' || voicePhase === 'transcribing'}
            accessibilityLabel={voicePhase === 'recording' ? 'Stop recording' : 'Record voice message'}
          >
            {voicePhase === 'recording'
              ? <Square color={Colors.primary[400]} size={22} />
              : <Mic color={Platform.OS === 'web' && !sending ? Colors.primary[400] : Colors.neutral[500]} size={22} strokeWidth={2} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || sending || voiceBusy) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending || voiceBusy}
          >
            {sending ? (
              <ActivityIndicator size="small" color={Colors.neutral[0]} />
            ) : (
              <Send color={Colors.neutral[0]} size={20} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[950],
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.neutral[950],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.neutral[400],
  },
  errorText: {
    ...Typography.body,
    color: Colors.error[400],
    textAlign: 'center',
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[800],
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary[400],
  },
  headerName: {
    ...Typography.subheading,
    color: Colors.neutral[100],
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success[400],
  },
  statusText: {
    ...Typography.small,
    color: Colors.neutral[400],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 300,
    backgroundColor: Colors.neutral[900],
    borderRightWidth: 1,
    borderRightColor: Colors.neutral[800],
    paddingTop: Spacing.xl,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sidebarTitle: {
    ...Typography.subheading,
    color: Colors.neutral[100],
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.md,
  },
  newChatText: {
    ...Typography.bodyMedium,
    color: Colors.primary[300],
    fontFamily: 'Inter-SemiBold',
  },
  conversationItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    marginHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  conversationItemActive: {
    backgroundColor: Colors.neutral[800],
  },
  conversationTitle: {
    ...Typography.bodyMedium,
    color: Colors.neutral[300],
  },
  conversationTitleActive: {
    color: Colors.neutral[100],
  },
  conversationDate: {
    ...Typography.small,
    color: Colors.neutral[500],
  },
  emptySidebarText: {
    ...Typography.body,
    color: Colors.neutral[500],
    textAlign: 'center',
    padding: Spacing.lg,
  },
  messagesList: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexGrow: 1,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: Spacing.sm + 2,
    maxWidth: '85%',
    gap: Spacing.sm,
  },
  messageWrapperUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  messageWrapperAI: {
    alignSelf: 'flex-start',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.neutral[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  messageBubble: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
  },
  messageBubbleUser: {
    backgroundColor: Colors.primary[600],
    borderBottomRightRadius: Radius.sm,
  },
  messageBubbleAI: {
    backgroundColor: Colors.neutral[800],
    borderBottomLeftRadius: Radius.sm,
  },
  messageText: {
    ...Typography.body,
    flexShrink: 1,
  },
  messageTextUser: {
    color: Colors.neutral[0],
  },
  messageTextAI: {
    color: Colors.neutral[100],
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl * 2,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.neutral[900],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyChatTitle: {
    ...Typography.heading,
    color: Colors.neutral[100],
    textAlign: 'center',
  },
  emptyChatSubtitle: {
    ...Typography.body,
    color: Colors.neutral[400],
    textAlign: 'center',
    lineHeight: 24,
  },
  errorBanner: {
    backgroundColor: Colors.error[900],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  errorBannerText: {
    ...Typography.caption,
    color: Colors.error[200],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.neutral[900],
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[800],
  },
  inputButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.neutral[100],
    backgroundColor: Colors.neutral[800],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.neutral[700],
  },
});
