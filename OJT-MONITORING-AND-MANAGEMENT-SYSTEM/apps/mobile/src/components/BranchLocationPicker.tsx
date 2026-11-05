import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentCoordinates } from '../services/location';

export interface PickedBranchLocation { latitude: number; longitude: number; address?: string }

// Colegio de Montalban, same default as the web LocationPickerMap.
const DEFAULT = { latitude: 14.731358, longitude: 121.137882 };

// Leaflet + OpenStreetMap inside a WebView: no API key, same tiles as the web coordinator map.
// The page reports every pin change to React Native; React Native moves the pin via setPin().
const html = (lat: number, lng: number, hasPin: boolean) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>html,body,#m{height:100%;margin:0}</style></head><body><div id="m"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
var map=L.map('m').setView([${lat},${lng}],${hasPin ? 17 : 14}),marker=null;
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
function report(p){window.ReactNativeWebView.postMessage(JSON.stringify({lat:+p.lat.toFixed(7),lng:+p.lng.toFixed(7)}))}
function setPin(lat,lng,fly,silent){
  if(!marker){marker=L.marker([lat,lng],{draggable:true}).addTo(map);marker.on('dragend',function(){report(marker.getLatLng())})}
  else marker.setLatLng([lat,lng]);
  if(fly)map.flyTo([lat,lng],17);
  if(!silent)report({lat:lat,lng:lng});
}
map.on('click',function(e){setPin(e.latlng.lat,e.latlng.lng,false)});
${hasPin ? `setPin(${lat},${lng},false,true);` : ''}
</script></body></html>`;

interface SearchResult { place_id: number; display_name: string; lat: string; lon: string }

export default function BranchLocationPicker({ visible, initialQuery, initialPin, onConfirm, onClose }: {
  visible: boolean; initialQuery: string; initialPin: { latitude: number; longitude: number } | null;
  onConfirm: (location: PickedBranchLocation) => void; onClose: () => void;
}) {
  const web = useRef<WebView>(null);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pin, setPin] = useState(initialPin);
  const [address, setAddress] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const start = initialPin ?? DEFAULT;

  const move = (latitude: number, longitude: number, label?: string) => {
    setPin({ latitude, longitude }); setAddress(label); setResults([]);
    web.current?.injectJavaScript(`setPin(${latitude},${longitude},true,true);true;`);
  };

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy(true); setMessage(''); setResults([]);
    try {
      // Nominatim's usage policy requires an identifying User-Agent, which only native fetch can set.
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ph&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'CDM-OJT-Monitoring/1.0', 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error('search');
      const data: SearchResult[] = await res.json();
      if (data.length) setResults(data); else setMessage('No match in the Philippines. Try a street or city, or tap the map.');
    } catch { setMessage('Search is unavailable. Tap the map to place the pin.'); }
    setBusy(false);
  }

  async function useMyLocation() {
    setBusy(true); setMessage('');
    const here = await getCurrentCoordinates();
    setBusy(false);
    if (here.status === 'success' && here.coords) move(here.coords.latitude, here.coords.longitude);
    else setMessage(here.errorMessage ?? 'Could not get your location.');
  }

  function onWebMessage(event: WebViewMessageEvent) {
    try {
      const { lat, lng } = JSON.parse(event.nativeEvent.data);
      if (Number.isFinite(lat) && Number.isFinite(lng)) { setPin({ latitude: lat, longitude: lng }); setAddress(undefined); }
    } catch { /* ignore malformed page messages */ }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pick the branch location</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close map"><Ionicons name="close" size={22} color="#526257" /></TouchableOpacity>
      </View>
      <View style={styles.searchRow}>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search"
          placeholder="Search address or landmark" placeholderTextColor="#879687" />
        <TouchableOpacity style={styles.searchBtn} onPress={search} disabled={busy || !query.trim()} accessibilityRole="button" accessibilityLabel="Search">
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {results.length > 0 && <FlatList style={styles.results} data={results} keyExtractor={(r) => String(r.place_id)} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <TouchableOpacity style={styles.result} onPress={() => move(parseFloat(item.lat), parseFloat(item.lon), item.display_name)}>
          <Text numberOfLines={2} style={styles.resultText}>{item.display_name}</Text></TouchableOpacity>} />}
      <View style={styles.mapBox}>
        <WebView ref={web} originWhitelist={['*']} source={{ html: html(start.latitude, start.longitude, !!initialPin) }}
          onMessage={onWebMessage} javaScriptEnabled setSupportMultipleWindows={false} />
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.secondary} onPress={useMyLocation} disabled={busy} accessibilityRole="button">
          <Ionicons name="locate" size={16} color="#0A3824" /><Text style={styles.secondaryText}>Use my current location</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>{pin ? `Pin: ${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}` : 'Tap the map or search to place a pin. Drag it to adjust.'}</Text>
        <TouchableOpacity style={[styles.confirm, !pin && { opacity: 0.5 }]} disabled={!pin}
          onPress={() => pin && onConfirm({ ...pin, address })} accessibilityRole="button">
          <Text style={styles.confirmText}>Use this location</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Your OJT Coordinator confirms the final location before approval.</Text>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFEFB' },
  header: { padding: 18, paddingTop: 40, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#DCE5DB' },
  title: { color: '#0A3824', fontSize: 18, fontWeight: '800' },
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#17231B', backgroundColor: '#fff' },
  searchBtn: { backgroundColor: '#0A3824', borderRadius: 10, width: 46, alignItems: 'center', justifyContent: 'center' },
  message: { color: '#8a5a00', fontSize: 12, paddingHorizontal: 12, paddingBottom: 6 },
  results: { maxHeight: 180, marginHorizontal: 12, borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 10, backgroundColor: '#fff' },
  result: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2EC' }, resultText: { color: '#17231B', fontSize: 12 },
  mapBox: { flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#DCE5DB' },
  footer: { paddingHorizontal: 12, paddingBottom: 24, gap: 8 },
  secondary: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: '#F1F5EF' },
  secondaryText: { color: '#0A3824', fontWeight: '600' },
  hint: { color: '#647568', fontSize: 12 },
  confirm: { backgroundColor: '#0A3824', borderRadius: 12, padding: 14, alignItems: 'center' }, confirmText: { color: '#fff', fontWeight: '800' },
});
