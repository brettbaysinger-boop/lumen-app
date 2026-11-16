import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brain, Search, Plus, RefreshCw } from 'lucide-react-native';

import { useAuth } from '@/lib/auth';
import { requestKey } from '@/lib/my-day';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme-context';
import { Radius, Spacing, Typography } from '@/lib/theme';

type Evidence = { id: string; content: string; kind: string };
type Receipt = { id: string; at: string; status: string; message: string };
type SearchReply = { backend: 'rmc'; scope: 'relevant_evidence'; complete_inventory: false; memories: Evidence[] };
type SaveReply = { backend: 'rmc'; status: string; confirmed: boolean };
type ReceiptsReply = { backend: 'rmc'; receipts: Receipt[] };
type PendingSave = { text: string; id: string };

function statusLabel(status: string) {
  return ({
    saved: 'Saved to RMC',
    existing: 'Already recorded',
    memory_off: 'Memory saving is disabled',
    not_saved: 'Not saved',
    unconfirmed: 'Save not confirmed',
  } as Record<string, string>)[status] || 'Unknown save result';
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

export function RmcMemoriesPanel({ companion }: { companion: { id: string; name: string } | null }) {
  const { colors: c } = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const controllers = useRef(new Set<AbortController>());
  const [query, setQuery] = useState('What do you remember about me?');
  const [results, setResults] = useState<Evidence[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [memoryText, setMemoryText] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsError, setReceiptsError] = useState('');
  const [receiptsBusy, setReceiptsBusy] = useState(false);

  const request = useCallback(async <T extends { backend: 'rmc' }>(
    urlPath: string, method: 'GET' | 'POST', expectedUser: string, body?: unknown
  ): Promise<T> => {
    const base = process.env.EXPO_PUBLIC_LUMEN_API_URL?.trim().replace(/\/+$/, '');
    if (!base) throw new Error('Lumen API address is missing.');
    const auth = await supabase.auth.getSession();
    if (auth.error || !auth.data.session || auth.data.session.user.id !== expectedUser ||
        currentUser.current !== expectedUser) {
      throw new Error('Your account changed. Sign in again.');
    }
    const controller = new AbortController();
    controllers.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 30000 : 16000);
    try {
      const response = await fetch(base + urlPath, {
        method,
        headers: {
          Authorization: 'Bearer ' + auth.data.session.access_token,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);
      const current = await supabase.auth.getSession();
      if (current.error || current.data.session?.user.id !== expectedUser ||
          currentUser.current !== expectedUser) {
        throw new Error('Your account changed. Results were discarded.');
      }
      if (!response.ok) {
        if (response.status === 401) throw new Error('Session expired. Sign in again.');
        if (response.status === 403) throw new Error('Memory access is disabled or denied.');
        if (response.status === 409) throw new Error('The memory backend changed. Refresh the page.');
        if (response.status === 404) throw new Error('Companion access is unavailable.');
        throw new Error('RMC did not complete the request. No result is confirmed.');
      }
      if (!result || typeof result !== 'object' || (result as { backend?: string }).backend !== 'rmc') {
        throw new Error('Unrecognized RMC response. No result is confirmed.');
      }
      return result as T;
    } finally {
      clearTimeout(timeout);
      controllers.current.delete(controller);
    }
  }, []);

  useEffect(() => {
    setResults([]);
    setHasSearched(false);
    setSearchError('');
    setReceipts([]);
    setReceiptsError('');
    setPendingSave(null);
    setSaveNotice('');
    setSearchBusy(false);
    setReceiptsBusy(false);
    setSaveBusy(false);
    return () => {
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
    };
  }, [userId, companion?.id]);

  const search = useCallback(async () => {
    const expected = userId;
    const id = companion?.id;
    const text = query.trim();
    if (!expected || !id || !text || searchBusy) return;
    setSearchBusy(true);
    setSearchError('');
    try {
      const reply = await request<SearchReply>(
        '/v0.2/rmc/memories?companion_id=' + encodeURIComponent(id) + '&q=' + encodeURIComponent(text),
        'GET', expected
      );
      if (currentUser.current !== expected) return;
      if (reply.scope !== 'relevant_evidence' || reply.complete_inventory !== false ||
          !Array.isArray(reply.memories) ||
          reply.memories.some(row => !row || typeof row.id !== 'string' ||
            typeof row.content !== 'string' || typeof row.kind !== 'string')) {
        throw new Error('RMC returned an invalid evidence list.');
      }
      setResults(reply.memories.slice(0, 12));
      setHasSearched(true);
    } catch (error) {
      if (currentUser.current === expected) {
        setResults([]);
        setHasSearched(false);
        setSearchError(error instanceof Error ? error.message : 'Memory search failed.');
      }
    } finally {
      if (currentUser.current === expected) setSearchBusy(false);
    }
  }, [companion?.id, query, request, searchBusy, userId]);

  const loadReceipts = useCallback(async () => {
    const expected = userId;
    const id = companion?.id;
    if (!expected || !id || receiptsBusy) return;
    setReceiptsBusy(true);
    setReceiptsError('');
    try {
      const reply = await request<ReceiptsReply>(
        '/v0.2/rmc/receipts?companion_id=' + encodeURIComponent(id), 'GET', expected
      );
      if (currentUser.current !== expected) return;
      if (!Array.isArray(reply.receipts) || reply.receipts.some(row =>
        !row || typeof row.status !== 'string' || typeof row.message !== 'string')) {
        throw new Error('Unexpected save receipt response.');
      }
      setReceipts(reply.receipts.slice(0, 20));
    } catch (error) {
      if (currentUser.current === expected) {
        setReceipts([]);
        setReceiptsError(error instanceof Error ? error.message : 'Could not load save receipts.');
      }
    } finally {
      if (currentUser.current === expected) setReceiptsBusy(false);
    }
  }, [companion?.id, receiptsBusy, request, userId]);

  useEffect(() => {
    if (userId && companion?.id) {
      void loadReceipts();
      void search();
    }
    // Initial relevance query and activity load only once per account/companion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companion?.id]);

  const save = useCallback(async () => {
    const expected = userId;
    const id = companion?.id;
    const content = memoryText.trim();
    if (!expected || !id || !content || saveBusy) return;
    if (pendingSave && pendingSave.text !== content) {
      setSaveNotice('The previous save is unconfirmed. Search for that fact before starting a different save.');
      return;
    }
    const operation = pendingSave ?? { text: content, id: requestKey() };
    setPendingSave(operation);
    setSaveBusy(true);
    setSaveNotice('');
    try {
      const reply = await request<SaveReply>('/v0.2/rmc/memories', 'POST', expected, {
        companion_id: id, request_id: operation.id, content: operation.text,
      });
      if (currentUser.current !== expected) return;
      if (!['saved', 'existing', 'memory_off', 'not_saved', 'unconfirmed'].includes(reply.status) ||
          reply.confirmed !== ['saved', 'existing'].includes(reply.status)) {
        throw new Error('Invalid save receipt. The result is not confirmed.');
      }
      setSaveNotice(statusLabel(reply.status) + (
        reply.confirmed ? '. You can search for this memory above.' :
        ' — check existing memories before trying again.'
      ));
      if (reply.confirmed || reply.status === 'memory_off' || reply.status === 'not_saved') {
        setPendingSave(null);
        if (reply.confirmed) setMemoryText('');
      }
    } catch (error) {
      if (currentUser.current === expected) {
        // An HTTP failure after sending might still have reached RMC.
        // Keep the original request_id for an idempotent repeat.
        setSaveNotice((error instanceof Error ? error.message : 'Save was not confirmed.') +
          ' Check search before retrying; the same request ID will be reused.');
      }
    } finally {
      if (currentUser.current === expected) setSaveBusy(false);
    }
  }, [companion?.id, memoryText, pendingSave, request, saveBusy, userId]);

  const box = {
    backgroundColor: c.neutral[900], borderWidth: 1, borderColor: c.neutral[800],
    borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm,
  } as const;
  const heading = { ...Typography.subheading, color: c.neutral[100] } as const;
  const body = { ...Typography.body, color: c.neutral[300] } as const;
  const subtle = { ...Typography.caption, color: c.neutral[400] } as const;
  const button = { backgroundColor: c.primary[600], padding: Spacing.sm + 3,
    borderRadius: Radius.md, alignItems: 'center' as const };
  const buttonText = { ...Typography.bodyMedium, color: c.neutral[0] };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.neutral[950] }} edges={['top']}>
      <ScrollView contentContainerStyle={{
        width: '100%', maxWidth: 640, alignSelf: 'center', padding: Spacing.md,
        gap: Spacing.md, paddingBottom: Spacing.xxl * 2,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.md }}>
          <Brain color={c.primary[400]} size={24} />
          <View>
            <Text style={{ ...Typography.heading, color: c.neutral[100] }}>Memories</Text>
            <Text style={subtle}>Raialume Memory Core · RMC mode</Text>
          </View>
        </View>
        <View style={box}>
          <Text style={heading}>How memory works</Text>
          <Text style={body}>RMC is the active long-term memory store. Explicit “remember that” commands and saves here are supported. Automatic long-term extraction from ordinary conversations is currently off in RMC mode.</Text>
          <Text style={subtle}>The previous Supabase memories are preserved separately, but are not shown here. Search returns relevant evidence, not every saved memory.</Text>
        </View>

        <View style={box}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Search size={19} color={c.primary[400]} />
            <Text style={heading}>Find remembered facts</Text>
          </View>
          <TextInput
            value={query} onChangeText={setQuery} editable={!searchBusy}
            placeholder="What do you remember about ...?"
            placeholderTextColor={c.neutral[500]} maxLength={2000}
            accessibilityLabel="Search RMC memories"
            style={{ ...body, borderRadius: Radius.md, backgroundColor: c.neutral[800],
              padding: Spacing.sm, minHeight: 48 }}
          />
          <TouchableOpacity onPress={() => { void search(); }} disabled={searchBusy || !query.trim() || !companion} style={button}>
            {searchBusy ? <ActivityIndicator color={c.neutral[0]} /> :
              <Text style={buttonText}>Search RMC</Text>}
          </TouchableOpacity>
          {!!searchError && <Text selectable style={{ ...subtle, color: c.error[200] }}>{searchError}</Text>}
          {hasSearched && <Text style={subtle}>{results.length} relevant {results.length === 1 ? 'match' : 'matches'} (not a full inventory)</Text>}
          {hasSearched && results.length === 0 &&
            <Text style={body}>No relevant evidence was found for that query. This does not prove that no memories exist.</Text>}
          {results.map((item, index) => (
            <View key={item.id + ':' + index} style={{ borderTopWidth: 1, borderTopColor: c.neutral[700], paddingTop: Spacing.sm, gap: 4 }}>
              <Text style={{ ...subtle, color: c.primary[300] }}>{item.kind === 'rmc_source' ? 'Source evidence' : 'Memory evidence'}</Text>
              <Text selectable style={body}>{item.content}</Text>
            </View>
          ))}
        </View>

        <View style={box}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Plus size={19} color={c.primary[400]} />
            <Text style={heading}>Save something to remember</Text>
          </View>
          <Text style={subtle}>Only save lasting facts you want {companion?.name || 'your companion'} to remember. RMC will confirm whether the save succeeded.</Text>
          <TextInput
            value={memoryText} onChangeText={setMemoryText}
            editable={!saveBusy && !pendingSave} multiline maxLength={10000}
            accessibilityLabel="Fact to save to RMC"
            placeholder="For example: My favorite place to walk is ..."
            placeholderTextColor={c.neutral[500]}
            style={{ ...body, backgroundColor: c.neutral[800], minHeight: 90,
              borderRadius: Radius.md, padding: Spacing.sm, textAlignVertical: 'top' }}
          />
          <TouchableOpacity onPress={() => { void save(); }} disabled={!memoryText.trim() || saveBusy || !companion} style={button}>
            {saveBusy ? <ActivityIndicator color={c.neutral[0]} /> :
              <Text style={buttonText}>{pendingSave ? 'Retry with same request ID' : 'Save to RMC'}</Text>}
          </TouchableOpacity>
          {!!saveNotice && <Text selectable style={{ ...body, color: c.primary[300] }}>{saveNotice}</Text>}
          {pendingSave && <Text style={subtle}>An earlier save is unconfirmed. Retrying here reuses the same idempotent request ID; it does not issue a new save request.</Text>}
        </View>

        <View style={box}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={heading}>Confirmed chat save activity</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => { void loadReceipts(); }} disabled={receiptsBusy}>
              <RefreshCw size={19} color={c.primary[300]} />
            </TouchableOpacity>
          </View>
          <Text style={subtle}>Recent RMC-tagged chat acknowledgements. These show what Lumen reported at the time, not a complete memory list or current retention proof.</Text>
          {receiptsBusy && <ActivityIndicator color={c.primary[400]} />}
          {!!receiptsError && <Text selectable style={{ ...subtle, color: c.error[200] }}>{receiptsError}</Text>}
          {!receiptsBusy && !receiptsError && receipts.length === 0 &&
            <Text style={body}>No RMC-tagged chat save receipts yet. New explicit chat saves will appear here after this update.</Text>}
          {receipts.map((item, index) => (
            <View key={item.id + ':' + index} style={{ paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[700], gap: 4 }}>
              <Text style={{ ...subtle, color: item.status === 'saved' || item.status === 'existing' ? c.primary[300] : c.neutral[400] }}>
                {statusLabel(item.status)} · {shortDate(item.at)}
              </Text>
              <Text selectable style={body}>{item.message}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
