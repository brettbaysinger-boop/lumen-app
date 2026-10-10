import { shouldSendOnEnter } from '@/lib/chat-input';
import { ModelPicker } from '@/components/ModelPicker';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Send,
  Mic,
  Plus,
  ChevronLeft,
  Volume2,
  Square,
  Paperclip,
  PanelLeft,
  Camera,
  Globe,
} from 'lucide-react-native';
import { CameraCapture } from '@/components/CameraCapture';
import { CompanionPortrait } from '@/components/CompanionPortrait';
import { PracticeSavedCard } from '@/components/PracticeSavedCard';
import { ProviderRequests } from '@/components/ProviderRequests';
import { DayActionCard } from '@/components/DayActionCard';
import { UnstuckDraft } from '@/components/UnstuckDraft';
import { DocumentActionDraft } from '@/components/DocumentActionDraft';
import { DocumentAttachment } from '@/components/DocumentAttachment';
import { documentRequest, type PrivateDocument } from '@/lib/documents';
import { DocumentSources } from '@/components/DocumentSources';
import { WebSources, CitationText } from '@/components/WebSources';
import { requestKey, type DayItem } from '@/lib/my-day';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { respondToMessage, generateImage, isImageRequest } from '@/lib/cognition';
import { imagePromptFromConfirmation } from '@/lib/image-followup';
import { pickImages, uploadImage, removeStoredFiles, MediaError, type PickedImage } from '@/lib/media';
import { MessageImages, PendingAttachments, readAttachments } from '@/components/ChatAttachments';
import { recordMicrophone, transcribeRecording, playReply, type RecordingHandle } from '@/lib/voice';
import { ConversationList, type ConversationListHandle } from '@/components/ConversationList';
import { useTheme } from '@/lib/theme-context';
import { Spacing, Radius, Typography, type ExtendedThemeColors } from '@/lib/theme';
import { StateGlow } from '@/components/StateGlow';
import { useCompanionState, getMoodFromState } from '@/hooks/useCompanionState';
import type { Companion, Conversation, Message } from '@/types/database';

export default function ChatScreen() {
  const { colors } = useTheme();
  const routeParams = useLocalSearchParams<{ conversation?: string; draft?: string; document?: string }>();
  const turnKey = useRef<{ text: string; id: string } | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  const isMobile = screenWidth < 600;
  const [showCamera, setShowCamera] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const [companion, setCompanion] = useState<Companion | null>(null);
  const { state: companionState } = useCompanionState(companion?.id);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [pendingDocument, setPendingDocument] = useState<PrivateDocument | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [sending, setSending] = useState(false);
  const sendBusyRef = useRef(false);
  const memoryWindowRef = useRef<string | null>(null);
  const [activity, setActivity] = useState('');
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [memoryQuestions, setMemoryQuestions] = useState<{id: string; content: string; subject: string}[]>([]);
  const [liveReply, setLiveReply] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [memoryNotice, setMemoryNotice] = useState<{id: string; content: string} | null>(null);
  const [creatingImage, setCreatingImage] = useState(false);
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const flatListRef = useRef<ConversationListHandle>(null);
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

  const styles = useMemoStyles(colors, isMobile);

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

  useEffect(() => {
    if (!companion || !activeConversation || sending) return;
    let active = true;
    const since = memoryWindowRef.current || new Date().toISOString();
    const timer = setInterval(async () => {
      const { data, error } = await supabase.from('memories').select('id,content')
        .eq('companion_id', companion.id).eq('conversation_id', activeConversation.id)
        .eq('source', 'automatic_observation').eq('is_active', true).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(1);
      if (active && !error && data?.[0]) setMemoryNotice(data[0]);
      const { data: questions } = await supabase.from('memory_suggestions')
        .select('id,content,subject,messages!inner(conversation_id)')
        .eq('companion_id', companion.id).eq('messages.conversation_id', activeConversation.id)
        .eq('status', 'pending').gte('created_at', since).order('created_at', { ascending: false }).limit(3);
      if (active && questions) setMemoryQuestions(questions);

    }, 2500);
    return () => { active = false; clearInterval(timer); };
  }, [companion?.id, activeConversation?.id, sending]);

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
            if (draft.length > 64000) throw new Error('The draft exceeds 64,000 characters. Save part as a note before adding more.');
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
    if (stopping) { setPlayingId(null); setSpeakingId(null); return; }
    if (voicePhaseRef.current !== 'idle') return;
    const controller = new AbortController();
    playbackRef.current = controller;
    setPlayingId(message.id);
    setError(null);
    const finished = () => {
      if (mountedRef.current && playbackRef.current === controller) { setPlayingId(null); setSpeakingId(null); }
    };
    try {
      await playReply(message.content, controller.signal, finished, { companionId: companion?.id, onError: err => { if (mountedRef.current && !controller.signal.aborted) setError(err.message); }, onStart: () => { if (mountedRef.current && !controller.signal.aborted) setSpeakingId(message.id); } });
    } catch (err) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Playback failed.');
        finished();
      }
    }
  }, [playingId, companion?.id]);

  const loadCompanion = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('companions')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
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

  useFocusEffect(useCallback(() => { void loadCompanion(); return () => { playbackRef.current?.abort(); }; }, [loadCompanion]));

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id);
    } else {
      setMessages([]);
    }
  }, [activeConversation, loadMessages]);

  useEffect(() => {
    const target = conversations.find(item => item.id === routeParams.conversation);
    if (target && !sending && !voiceBusy) { setActiveConversation(target); router.setParams({ conversation: undefined }); }
  }, [routeParams.conversation, conversations, sending, voiceBusy]);
  useEffect(() => {
    if (routeParams.draft && !sending && !voiceBusy) {
      setInputText(routeParams.draft.slice(0, 64000));
      if (!routeParams.document && /^Search my documents:/i.test(routeParams.draft)) setPendingDocument(null);
      router.setParams({ draft: '' });
    }
  }, [routeParams.draft, routeParams.document, sending, voiceBusy]);

  useEffect(() => {
    if (!routeParams.document || !companion) return;
    let active = true;
    setDocumentBusy(true);
    documentRequest<PrivateDocument[]>(companion.id).then(documents => {
      if (!active) return;
      const selected = documents.find(document => document.id === routeParams.document);
      if (selected) setPendingDocument(selected);
      else setError('This document is no longer available.');
      setDocumentBusy(false);
      router.setParams({ document: '' });
    }).catch(error => { if (active) { setError(error.message); setDocumentBusy(false); } });
    return () => { active = false; };
  }, [routeParams.document, companion?.id]);

  const createConversation = useCallback(async () => {
    if (!companion || sending || documentBusy || voicePhaseRef.current !== 'idle') return;
    setPendingDocument(null);
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
  }, [companion, sending, documentBusy]);

  const attachPhotos = useCallback(async () => {
    setError(null);
    try {
      const remaining = 4 - pendingImages.length;
      if (remaining <= 0) {
        setError('You can attach up to 4 photos per message.');
        return;
      }
      const picked = await pickImages({ multiple: true, limit: remaining });
      if (picked.length) setPendingImages((prev) => [...prev, ...picked].slice(0, 4));
    } catch (err) {
      setError(err instanceof MediaError ? err.message : 'Could not open your photos. Please try again.');
    }
  }, [pendingImages.length]);

  const sendMessage = useCallback(async () => {
    const userId = session?.user.id;
    if (
      (!inputText.trim() && !pendingImages.length && !pendingDocument) ||
      documentBusy ||
      !companion ||
      !userId ||
      sendBusyRef.current ||
      sending ||
      voicePhaseRef.current !== 'idle'
    ) return;
    playbackRef.current?.abort();

    sendBusyRef.current = true;
    memoryWindowRef.current = new Date().toISOString();
    const text = inputText.trim() || (pendingDocument ? 'Explain this document in plain language.' : '');
    setPendingQuestion(text);
    setLiveReply('');
    setActivity(`${companion.name} thinking…`);
    setMemoryNotice(null);
    setMemoryQuestions([]);
    if (!turnKey.current || turnKey.current.text !== text) turnKey.current = { text, id: requestKey() };
    const images = pendingImages;
    const document = pendingDocument;
    const followupImagePrompt = !document && !images.length
      ? imagePromptFromConfirmation(text, messages)
      : null;
    const wantsImage = !document && !images.length &&
      (isImageRequest(text) || followupImagePrompt !== null);
    setInputText('');
    setPendingImages([]);
    setSending(true);
    setCreatingImage(wantsImage);
    Keyboard.dismiss();

    setError(null);
    const uploaded: string[] = [];
    let handedToServer = false;
    try {
      let response: { conversation_id: string };
      if (wantsImage) {
        response = await generateImage(
          companion.id,
          activeConversation?.id ?? null,
          followupImagePrompt ?? text,
          followupImagePrompt ? text : undefined,
        );
      } else {
        for (const image of images) {
          uploaded.push(await uploadImage('chat-media', userId, image, 10 * 1024 * 1024));
        }
        const attachments = uploaded.map((path, i) => ({ path, mime_type: images[i].mimeType }));
        handedToServer = true;
        response = await respondToMessage(
          companion.id,
          activeConversation?.id ?? null,
          text || (images.length > 1
            ? 'I wanted to share these photos with you.'
            : 'I wanted to share this photo with you.'),
          attachments,
          (event) => {
            if (event.type === 'activity') setActivity(event.text || `${companion.name} thinking…`);
            if (event.type === 'delta') {
              setActivity(`${companion.name} thinking…`);
              setLiveReply(reply => reply + event.text);
            }
            if (event.type === 'reset') setLiveReply('');
          },
          turnKey.current.id,
          document?.id,
        );
      }
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
      turnKey.current = null;
    } catch (err) {
      if (!handedToServer) await removeStoredFiles('chat-media', uploaded);
      setError(err instanceof Error ? err.message : 'Lumen could not respond.');
      setInputText(text);
      setPendingImages(images);
    } finally {
      sendBusyRef.current = false;
      setSending(false);
      setPendingQuestion('');
      setLiveReply('');
      setActivity('');
      setCreatingImage(false);
    }
  }, [inputText, pendingImages, pendingDocument, documentBusy, companion, session?.user.id, sending, activeConversation, loadMessages, messages]);

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
          <View
            style={[
              styles.messageWrapper,
              item.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAI,
            ]}
          >
            {item.role === 'assistant' && (
              <View style={{ marginTop: 2 }}><CompanionPortrait colors={colors} size={isMobile ? 36 : 46} portraitUrl={companion?.portrait_url} mood={getMoodFromState(companionState)} speaking={speakingId === item.id} /></View>
            )}
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleAI,
              ]}
            >
              {!!item.metadata?.document_title && <Text style={{ color: colors.primary[300], marginBottom: 8 }}>Document: {String(item.metadata.document_title)}</Text>}
              <MessageImages attachments={readAttachments(item.metadata)} colors={colors} />
              <Text
                style={[
                  styles.messageText,
                  item.role === 'user' ? styles.messageTextUser : styles.messageTextAI,
                ]}
              >
                {item.role === 'assistant' && item.metadata?.web_search
                  ? <CitationText content={item.content} value={item.metadata.web_search} />
                  : item.content}
              </Text>
              {item.role === 'assistant' && item.metadata?.goal_session != null && <PracticeSavedCard value={item.metadata.goal_session}/> }
              {item.role === 'assistant' && item.metadata?.my_day_item != null && <DayActionCard item={item.metadata.my_day_item as DayItem} />}
              {item.role === 'assistant' && item.metadata?.web_search != null && <WebSources value={item.metadata.web_search} />}
              {item.role === 'assistant' && item.metadata?.unstuck_draft != null && <UnstuckDraft value={item.metadata.unstuck_draft} companionId={item.companion_id} messageId={item.id}/> }
              {item.role === 'assistant' && item.metadata?.document_action_draft != null && <DocumentActionDraft value={item.metadata.document_action_draft} companionId={item.companion_id} messageId={item.id} />}
              {item.role === 'assistant' && item.metadata?.document_sources != null && <DocumentSources value={item.metadata.document_sources} companionId={item.companion_id} />}
              {item.role === 'assistant' && <ProviderRequests value={item.metadata?.provider_requests} />}
              {item.role === 'assistant' && item.metadata?.timings_ms != null && (
                <View>
                  <TouchableOpacity onPress={() => setExpandedActivity(expandedActivity === item.id ? null : item.id)}>
                    <Text style={{ color: colors.primary[300], fontSize: 12, marginTop: 8 }}>Activity details {expandedActivity === item.id ? '▾' : '▸'}</Text>
                  </TouchableOpacity>
                  {expandedActivity === item.id && <Text style={{ color: colors.neutral[400], fontSize: 12, marginTop: 8 }}>
                    Model: {item.model_used || 'local'}{'\n'}
                    {Object.entries(item.metadata.timings_ms as Record<string, number>).map(([key, value]) =>
                      `${key.replace(/_/g, ' ')}: ${(value / 1000).toFixed(2)}s`).join('\n')}
                    {'\n'}Request: {((item.latency_ms || 0) / 1000).toFixed(2)}s{'\n'}Activity timings, not a private thought transcript.
                  </Text>}
                </View>
              )}
              {item.role === 'assistant' &&
                (item.metadata?.memory_status === 'saved' || item.metadata?.memory_status === 'existing') && (
                  <Text style={{ color: colors.primary[300], fontSize: 12, marginTop: 8 }}>
                    {item.metadata.memory_status === 'saved' ? 'Memory saved' : 'Memory already saved'}
                    {item.metadata.memory_subject === 'user' ? ' · About you' :
                      item.metadata.memory_subject === 'companion' ? ` · About ${companion?.name || 'your companion'}` :
                      item.metadata.memory_subject === 'shared' ? ' · Shared experience' :
                      item.metadata.memory_subject === 'unknown' ? ' · Subject unassigned' : ''}
                  </Text>
                )}
              {item.role === 'assistant' && Platform.OS === 'web' && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
                  onPress={() => togglePlayback(item)}
                  disabled={voiceBusy}
                  accessibilityLabel={playingId === item.id ? 'Stop reply audio' : 'Play reply audio'}
                >
                  {playingId === item.id
                    ? <Square color={colors.primary[300]} size={16} />
                    : <Volume2 color={colors.primary[300]} size={16} />}
                  <Text style={{ color: colors.primary[300], fontSize: 12 }}>
                    {playingId === item.id ? 'Stop audio' : 'Play reply'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ),
    [styles, colors, isMobile, companion?.portrait_url,
     companion?.name, companionState, speakingId,
     expandedActivity, playingId, voiceBusy, togglePlayback],
  );

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [messages, liveReply, pendingQuestion]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={colors.primary[400]} />
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

  const sidebarWidth = isMobile ? screenWidth * 0.82 : 280;

  return (
    <SafeAreaView style={[styles.container, { flexDirection: 'row' }]} edges={['top']}>
      <View style={{ flex: 1, minWidth: 0 }}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.menuButton}
          disabled={sending}
          accessibilityLabel="Open conversation history"
          onPress={() => setShowSidebar(true)}
        >
          <PanelLeft color={colors.neutral[300]} size={20} strokeWidth={1.6} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <StateGlow colors={colors} state={companionState} size={10} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{companion?.name || 'Companion'}</Text>
            {companion && <ModelPicker companionId={companion.id} compact disabled={sending || voiceBusy} />}
          </View>
        </View>
        <View style={styles.headerStatus}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open your documents" disabled={sending || voiceBusy || documentBusy} onPress={() => router.push('/documents')}>
            <Text style={{color:colors.primary[300],fontSize:12}}>Documents</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open goals and practice" disabled={sending || voiceBusy} onPress={()=>router.push({pathname:'/goals',params:{goal:activeConversation?.goal_item_id||''}})}><Text style={{color:colors.primary[300],fontSize:12}}>Practice</Text></TouchableOpacity>
          <Text style={styles.statusText}>
            {sending ? 'Thinking…' : 'Conversation'}
          </Text>
        </View>
      </View>

      {showSidebar && (
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowSidebar(false)}
        >
          <View style={[styles.sidebar, { width: sidebarWidth }]}>
            <View style={styles.sidebarHeader}>
              <TouchableOpacity onPress={() => setShowSidebar(false)}>
                <ChevronLeft color={colors.neutral[200]} size={24} strokeWidth={2} />
              </TouchableOpacity>
              <Text style={styles.sidebarTitle}>Conversations</Text>
            </View>
            <TouchableOpacity style={styles.newChatButton} onPress={createConversation} disabled={sending || voiceBusy}>
              <Plus color={colors.primary[400]} size={20} strokeWidth={2} />
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

      <ConversationList
        ref={flatListRef}
        data={messages}
        ListFooterComponent={sending ? <View style={{ gap: 12, padding: 16 }}>
          <Text style={{ color: colors.neutral[100], textAlign: 'right' }}>{pendingQuestion}</Text>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <CompanionPortrait colors={colors} size={isMobile ? 36 : 46} portraitUrl={companion?.portrait_url} mood="thinking" />
            <View style={{ flex: 1, gap: 12 }}><Text accessibilityLiveRegion="polite" style={{ color: colors.primary[300] }}>{activity}</Text>
            {!!liveReply && <Text style={{ color: colors.neutral[100], lineHeight: 26 }}>{liveReply}</Text>}</View>
          </View>
        </View> : null}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        renderItem={renderMessage}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <CompanionPortrait colors={colors} size={isMobile ? 140 : 170} portraitUrl={companion?.portrait_url} />
            <Text style={styles.emptyChatTitle}>
              A moment with {companion?.name || 'your companion'}.
            </Text>
            <Text style={styles.emptyChatSubtitle}>
              No agenda needed. Start wherever you are.
            </Text>
            <View style={styles.starters}>
              {["What's on my plate?", 'Let’s dream a little', 'Add a task: '].map(prompt =>
                <TouchableOpacity key={prompt} style={styles.starter} onPress={() => setInputText(prompt)} accessibilityRole="button">
                  <Text style={styles.starterText}>{prompt}</Text>
                </TouchableOpacity>)}
            </View>
          </View>
        }
      />

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}
      {memoryQuestions.map(question => <View key={question.id} style={styles.errorBanner}>
        <Text style={styles.errorBannerText}>Should I remember this? {question.content} (About: {question.subject})</Text>
        <Text style={styles.errorBannerText}>You can edit the wording and ownership in Memories.</Text>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          {(['approve', 'dismiss'] as const).map(action => <TouchableOpacity key={action} onPress={async () => {
            const { error } = await supabase.rpc('review_memory_suggestion', { p_id: question.id, p_action: action });
            if (error) setError('Could not review this memory. Try again in Memories.');
            else setMemoryQuestions(items => items.filter(item => item.id !== question.id));
          }}><Text style={{ color: colors.primary[300] }}>{action === 'approve' ? 'Yes, remember' : 'Skip'}</Text></TouchableOpacity>)}
        </View>
      </View>)}
      {memoryNotice && <View style={styles.errorBanner}>
        <Text style={styles.errorBannerText}>Memory saved: {memoryNotice.content}</Text>
        <TouchableOpacity onPress={async () => {
          const { error } = await supabase.from('memories').update({ is_active: false }).eq('id', memoryNotice.id);
          if (error) setError('Could not undo this memory. Try again in Memories.');
          else setMemoryNotice(null);
        }}><Text style={{ color: colors.primary[300] }}>Undo</Text></TouchableOpacity>
      </View>}
      {creatingImage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            {companion?.name || 'Your companion'} is creating your image. This can take up to a minute.
          </Text>
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
        <PendingAttachments
          images={pendingImages}
          onRemove={(index) => setPendingImages((prev) => prev.filter((_, i) => i !== index))}
          colors={colors}
          disabled={sending}
        />
        {pendingImages.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, paddingBottom: 8 }}>
          {[
            ['Describe', 'Describe what you can see in this photo.'],
            ['Read text', 'Transcribe the visible text in this photo. Mark anything unreadable instead of guessing.'],
            ['Explain', 'Explain this photo or document in plain language. Separate visible facts from interpretation.'],
            ['Meal ideas', 'Suggest a meal using the ingredients you can identify in this photo. Ask about anything unclear.'],
          ].map(([label, prompt]) => <TouchableOpacity key={label} accessibilityRole="button" disabled={sending} onPress={() => setInputText(prompt)}>
            <Text style={{ color: colors.primary[300], fontSize: 12 }}>{label}</Text>
          </TouchableOpacity>)}
        </View>}
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          {showAttachments && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, backgroundColor: colors.neutral[900] }}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Attach photos" disabled={sending || voiceBusy || documentBusy || !!pendingDocument || pendingImages.length >= 4}
              onPress={() => { setShowAttachments(false); void attachPhotos(); }} style={{ padding: 10 }}>
              <Text style={{ color: colors.primary[300] }}>Photo</Text>
            </TouchableOpacity>
            {companion && <DocumentAttachment companionId={companion.id} disabled={sending || voiceBusy || documentBusy || !!pendingImages.length}
              onSelect={document => { setPendingDocument(document); setShowAttachments(false); }} onBusy={setDocumentBusy} />}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open document library" disabled={sending || voiceBusy || documentBusy}
              onPress={() => { setShowAttachments(false); router.push('/documents'); }} style={{ padding: 10 }}>
              <Text style={{ color: colors.primary[300] }}>Saved documents</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close attachment menu" disabled={documentBusy} onPress={() => setShowAttachments(false)} style={{ padding: 10 }}>
              <Text style={{ color: colors.neutral[300] }}>Close</Text>
            </TouchableOpacity>
          </View>}
          {pendingDocument && <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.neutral[900], gap: 8 }}>
            <Text style={{ color: colors.neutral[100] }}>Using document: {pendingDocument.title}</Text>
            <Text style={{ color: colors.neutral[400], fontSize: 12 }}>Your next questions use this document. Remove it to return to ordinary chat. Extracted text is saved in your document library.</Text>
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <TouchableOpacity accessibilityRole="button" disabled={sending || documentBusy} onPress={() => setInputText('Explain this document in plain language.')}>
                <Text style={{ color: colors.primary[300] }}>Explain document</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove document from prompt" disabled={sending || documentBusy} onPress={() => setPendingDocument(null)}>
                <Text style={{ color: colors.neutral[300] }}>Remove</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              {[['Draft checklist','Create a preparation checklist from this document.'],['Draft note','Draft a short note from this document. Include only three important details, with a source citation in each bullet.'],['Draft follow-up','Draft a follow-up reminder about this document.']].map(([label,prompt]) =>
                <TouchableOpacity key={label} accessibilityRole="button" disabled={sending || documentBusy} onPress={()=>setInputText(prompt)}><Text style={{color:colors.primary[300]}}>{label}</Text></TouchableOpacity>)}
            </View>
          </View>}
        </View>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.inputButton} accessibilityLabel="Search the web" disabled={sending || voiceBusy || documentBusy || !!pendingDocument} onPress={() => setInputText(text => /^search (?:the )?web:/i.test(text) ? text : `Search the web: ${text}`)}>
            <Globe color={colors.primary[400]} size={21} strokeWidth={1.6} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputButton}
            onPress={() => setShowAttachments(open => !open)}
            disabled={sending || voiceBusy || documentBusy}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAttachments }}
            accessibilityLabel="Attach files"
          >
            <Paperclip color={sending || voiceBusy ? colors.neutral[500] : colors.primary[400]} size={22} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputButton} accessibilityLabel="Take a photo" disabled={sending || voiceBusy || documentBusy || !!pendingDocument || pendingImages.length >= 4} onPress={() => setShowCamera(true)}>
            <Camera color={sending || voiceBusy || pendingImages.length >= 4 ? colors.neutral[500] : colors.primary[400]} size={21} strokeWidth={1.6} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={pendingImages.length ? 'Add a message (optional)...' : `Message ${companion?.name || 'your companion'}…`}
            placeholderTextColor={colors.neutral[500]}
            multiline
            {...(Platform.OS === 'web' ? { onKeyPress: (event: any) => {
              if (shouldSendOnEnter(event)) {
                event.preventDefault();
                void sendMessage();
              }
            } } : {})}
            maxLength={64000}
            editable={!sending && !voiceBusy && !documentBusy}
          />
          <TouchableOpacity
            style={styles.inputButton}
            onPress={toggleRecording}
            disabled={Platform.OS !== 'web' || sending || voicePhase === 'starting' || voicePhase === 'transcribing'}
            accessibilityLabel={voicePhase === 'recording' ? 'Stop recording' : 'Record voice message'}
          >
            {voicePhase === 'recording'
              ? <Square color={colors.primary[400]} size={22} />
              : <Mic color={Platform.OS === 'web' && !sending ? colors.primary[400] : colors.neutral[500]} size={22} strokeWidth={2} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              ((!inputText.trim() && !pendingImages.length && !pendingDocument) || sending || voiceBusy || documentBusy) && styles.sendButtonDisabled,
            ]}
            accessibilityLabel="Send message"
            onPress={sendMessage}
            disabled={(!inputText.trim() && !pendingImages.length && !pendingDocument) || sending || voiceBusy || documentBusy}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.neutral[0]} />
            ) : (
              <Send color={colors.neutral[0]} size={20} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.composerHint}>A conversation that stays with you.</Text>
      </KeyboardAvoidingView>
      </View>
      {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={image => setPendingImages(previous => [...previous, image].slice(0, 4))} />}
    </SafeAreaView>
  );
}

function useMemoStyles(c: ExtendedThemeColors, isMobile: boolean) {
  return useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.neutral[950],
      overflow: 'hidden',
    },
    loadingContainer: {
      flex: 1,
      backgroundColor: c.neutral[950],
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    loadingText: {
      ...Typography.body,
      color: c.neutral[400],
    },
    errorText: {
      ...Typography.body,
      color: c.error[400],
      textAlign: 'center',
      padding: Spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isMobile ? Spacing.sm + 2 : Spacing.md,
      paddingVertical: 18,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[800],
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },
    menuButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      flex: 1,
      justifyContent: 'flex-start',
      marginLeft: 14,
    },
    avatarDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    headerName: {
      ...Typography.subheading,
      color: c.neutral[100],
      flexShrink: 1,
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
    },
    statusText: {
      ...Typography.small,
      color: c.neutral[400],
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
      backgroundColor: c.neutral[900],
      borderRightWidth: 1,
      borderRightColor: c.neutral[800],
      paddingTop: Spacing.lg,
    },
    sidebarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.md,
      marginBottom: Spacing.md,
    },
    sidebarTitle: {
      ...Typography.subheading,
      color: c.neutral[100],
    },
    newChatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.md,
      backgroundColor: c.neutral[800],
      borderRadius: Radius.md,
    },
    newChatText: {
      ...Typography.bodyMedium,
      color: c.primary[300],
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
      backgroundColor: c.neutral[800],
    },
    conversationTitle: {
      ...Typography.bodyMedium,
      color: c.neutral[300],
    },
    conversationTitleActive: {
      color: c.neutral[100],
    },
    conversationDate: {
      ...Typography.small,
      color: c.neutral[500],
    },
    emptySidebarText: {
      ...Typography.body,
      color: c.neutral[500],
      textAlign: 'center',
      padding: Spacing.lg,
    },
    messagesList: {
      paddingVertical: Spacing.md,
      paddingHorizontal: isMobile ? Spacing.sm + 2 : Spacing.md,
      flexGrow: 1,
      maxWidth: 800,
      alignSelf: 'center',
      width: '100%',
    },
    messageWrapper: {
      flexDirection: 'row',
      marginBottom: 28,
      maxWidth: isMobile ? '92%' : '85%',
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
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.neutral[800],
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    messageBubble: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
      borderRadius: Radius.lg,
      flexShrink: 1,
    },
    messageBubbleUser: {
      backgroundColor: c.neutral[800],
      borderBottomRightRadius: Radius.sm,
    },
    messageBubbleAI: {
      backgroundColor: 'transparent',
      borderBottomLeftRadius: Radius.sm,
    },
    messageText: {
      ...Typography.body,
      flexShrink: 1,
      flexWrap: 'wrap',
    },
    messageTextUser: {
      color: c.neutral[0],
    },
    messageTextAI: {
      color: c.neutral[100],
    },
    emptyChat: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: isMobile ? 24 : 40,
      paddingBottom: 32,
      paddingHorizontal: Spacing.xl,
      gap: Spacing.md,
    },
    emptyChatPortraitStage: {
      width: 248,
      height: 248,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    emptyChatGlow: {
      position: 'absolute',
      width: 236,
      height: 236,
      borderRadius: 118,
      backgroundColor: c.primary[400],
    },
    emptyChatPortraitRing: {
      width: 216,
      height: 216,
      borderRadius: 108,
      padding: Spacing.xs,
      borderWidth: 1,
      borderColor: c.neutral[700],
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 1,
    },
    emptyChatPortrait: {
      width: 200,
      height: 200,
      borderRadius: 100,
    },
    emptyChatTitle: {
      ...Typography.heading,
      fontSize: isMobile ? 26 : 34,
      lineHeight: 42,
      letterSpacing: -1,
      fontFamily: 'Inter-Medium',
      color: c.neutral[100],
      textAlign: 'center',
    },
    emptyChatSubtitle: {
      ...Typography.body,
      color: c.neutral[400],
      textAlign: 'center',
      lineHeight: 24,
    },
    errorBanner: {
      backgroundColor: c.error[900],
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginHorizontal: Spacing.md,
      borderRadius: Radius.md,
    },
    errorBannerText: {
      ...Typography.caption,
      color: c.error[200],
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: isMobile ? Spacing.xs + 2 : Spacing.sm,
      paddingHorizontal: isMobile ? Spacing.sm + 2 : Spacing.md,
      paddingVertical: Spacing.sm,
      backgroundColor: c.neutral[900],
      borderWidth: 1,
      borderColor: c.neutral[700],
      borderRadius: 20,
      maxWidth: 800,
      alignSelf: 'center',
      width: isMobile ? '96%' : '92%',
    },
    inputButton: {
      width: isMobile ? 28 : 38,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textInput: {
      flex: 1,
      ...Typography.body,
      color: c.neutral[100],
      backgroundColor: 'transparent',
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm + 2,
      maxHeight: 260,
      minHeight: 44,
    },
    starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
    starter: { borderWidth: 1, borderColor: c.neutral[700], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    starterText: { ...Typography.caption, color: c.neutral[300] },
    composerHint: { ...Typography.small, color: c.neutral[400], textAlign: 'center', paddingVertical: 12 },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.primary[500],
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: c.neutral[700],
    },
  }), [c, isMobile]);
}
