import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet,
  KeyboardAvoidingView, Platform, Linking, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requireUser } from '../../lib/studentIdentity';
import {
  listGroupMessages, sendGroupMessage, subscribeGroupMessages, listGroupDocuments, getGroupDocumentUrl,
  type GroupMessage, type GroupDocument,
} from '../../services/groupChat';

export default function GroupScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'chat' | 'documents'>('chat');
  const [me, setMe] = useState('');
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [documents, setDocuments] = useState<GroupDocument[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<GroupMessage>>(null);

  const loadMessages = useCallback(async () => {
    const res = await listGroupMessages();
    if (res.error) setError(res.error.message);
    else { setError(''); setMessages(res.data ?? []); }
  }, []);

  const loadDocuments = useCallback(async () => {
    const res = await listGroupDocuments();
    if (res.error) setError(res.error.message);
    else { setError(''); setDocuments(res.data ?? []); }
  }, []);

  useEffect(() => {
    void (async () => {
      const who = await requireUser();
      if (who.data) setMe(who.data.user_id);
      await Promise.all([loadMessages(), loadDocuments()]);
      setLoading(false);
    })();
    return subscribeGroupMessages(() => { void loadMessages(); });
  }, [loadMessages, loadDocuments]);

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setError('');
    const res = await sendGroupMessage(content);
    if (res.error) setError(res.error.message);
    else { setDraft(''); await loadMessages(); }
    setSending(false);
  };

  const openDocument = async (item: GroupDocument) => {
    setError('');
    const res = await getGroupDocumentUrl(item.document_id);
    if (res.error || !res.data) { setError(res.error?.message ?? 'Could not open the document.'); return; }
    try { await Linking.openURL(res.data.signedUrl); } catch { setError('No app on this device can open the document.'); }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMessages(), loadDocuments()]);
    setRefreshing(false);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#0A3824" /></View>;

  return (
    <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Text style={s.kicker}>Colegio de Montalban OJT</Text>
        <Text style={s.title}>My Department</Text>
        <View style={s.tabs}>
          {(['chat', 'documents'] as const).map(key => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}
              style={[s.tab, tab === key && s.tabActive]}>
              <Text style={[s.tabText, tab === key && s.tabTextActive]}>{key === 'chat' ? 'Group Chat' : 'Documents'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}

      {tab === 'chat' ? (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.message_id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={<Text style={s.empty}>No messages yet. Say hello to your department.</Text>}
            renderItem={({ item }) => {
              const mine = item.sender_user_id === me;
              return (
                <View style={[s.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
                  <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                    {!mine && <Text style={s.sender}>{item.sender_name}{item.sender_role === 'Coordinator' ? ' · Coordinator' : ''}</Text>}
                    <Text style={[s.body, mine && { color: '#fff' }]}>{item.content}</Text>
                    <Text style={[s.time, mine && { color: '#CFE6D8' }]}>{new Date(item.created_at).toLocaleString()}</Text>
                  </View>
                </View>
              );
            }}
          />
          <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Message your department…" multiline maxLength={4000}
              style={s.input} accessibilityLabel="Write a message" />
            <TouchableOpacity onPress={send} disabled={!draft.trim() || sending} accessibilityRole="button" accessibilityLabel="Send"
              style={[s.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}>
              <Text style={s.sendText}>{sending ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={d => d.document_id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={s.empty}>No documents yet. Files your Coordinator sends you appear here.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => openDocument(item)} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`} style={s.docCard} activeOpacity={0.8}>
              <Text style={s.docTitle}>{item.title}</Text>
              <Text style={s.docMeta}>{item.file_name} · {new Date(item.created_at).toLocaleDateString()}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F8F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F8F5' },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  kicker: { fontSize: 11, fontWeight: '700', color: '#7A887D', textTransform: 'uppercase', marginTop: 8 },
  title: { fontSize: 22, fontWeight: '800', color: '#0A3824' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#DCE5DB', backgroundColor: '#FFFEFB' },
  tabActive: { backgroundColor: '#0A3824', borderColor: '#0A3824' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#3D4A40' },
  tabTextActive: { color: '#fff' },
  error: { marginHorizontal: 16, marginBottom: 4, padding: 8, borderRadius: 8, backgroundColor: '#FDECEC', color: '#9B1C1C', fontSize: 13 },
  empty: { textAlign: 'center', color: '#7A887D', marginTop: 40, fontSize: 14 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#0A3824' },
  bubbleOther: { backgroundColor: '#FFFEFB', borderWidth: 1, borderColor: '#DCE5DB' },
  sender: { fontSize: 11, fontWeight: '800', color: '#0A3824', marginBottom: 2 },
  body: { fontSize: 14, color: '#1F2A22' },
  time: { fontSize: 10, color: '#7A887D', marginTop: 3 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#DCE5DB', backgroundColor: '#FFFEFB' },
  input: { flex: 1, maxHeight: 110, minHeight: 40, borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, backgroundColor: '#fff' },
  sendBtn: { backgroundColor: '#0A3824', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  docCard: { backgroundColor: '#FFFEFB', borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 14, padding: 14 },
  docTitle: { fontSize: 15, fontWeight: '800', color: '#0A3824' },
  docMeta: { fontSize: 12, color: '#7A887D', marginTop: 3 },
});
