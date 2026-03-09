import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  SafeAreaView, ScrollView, TextInput, Alert, ActivityIndicator, Switch
} from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { updateProfile, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { scheduleReminderNotifications, cancelOverdueReminders } from '../../notifications';

const HOUSEHOLD_ID = 'balu_family';

const DEFAULT_SLOTS = [
  { key: 'morning', label: '🌅 Morning',  hour: 7,  minute: 0,  enabled: true  },
  { key: 'midday',  label: '☀️ Midday',   hour: 13, minute: 0,  enabled: true  },
  { key: 'evening', label: '🌆 Evening',  hour: 18, minute: 0,  enabled: true  },
  { key: 'night',   label: '🌙 Night',    hour: 21, minute: 0,  enabled: false },
];

const SKIP_OPTIONS = [
  { label: 'Skip if walked in last 2 hours', value: 2 },
  { label: 'Skip if walked in last 4 hours', value: 4 },
  { label: 'Always remind',                  value: 0 },
];

function pad(n: number) { return n.toString().padStart(2, '0'); }

type Slot = { key: string; label: string; hour: number; minute: number; enabled: boolean };

function TimeEditor({ slot, onChange }: { slot: Slot; onChange: (h: number, m: number) => void }) {
  const [hourText, setHourText] = useState(slot.hour.toString());
  const [minText,  setMinText]  = useState(pad(slot.minute));

  function commit() {
    let h = parseInt(hourText, 10);
    let m = parseInt(minText, 10);
    if (isNaN(h) || h < 0 || h > 23) { h = slot.hour; }
    if (isNaN(m) || m < 0 || m > 59) { m = slot.minute; }
    setHourText(h.toString());
    setMinText(pad(m));
    onChange(h, m);
  }

  return (
    <View style={te.row}>
      <TextInput style={te.input} value={hourText} onChangeText={setHourText}
        onBlur={commit} keyboardType="number-pad" maxLength={2} selectTextOnFocus />
      <Text style={te.colon}>:</Text>
      <TextInput style={te.input} value={minText} onChangeText={setMinText}
        onBlur={commit} keyboardType="number-pad" maxLength={2} selectTextOnFocus />
      <Text style={te.ampm}>{slot.hour >= 12 ? 'PM' : 'AM'}</Text>
    </View>
  );
}

const te = StyleSheet.create({
  row:  { flexDirection: 'row', alignItems: 'center' },
  input: { backgroundColor: '#FAF6F1', borderRadius: 8, borderWidth: 1, borderColor: '#EDE0D4', paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700', color: '#3d2b1f', width: 42, textAlign: 'center' },
  colon: { fontSize: 18, fontWeight: '700', color: '#3d2b1f', marginHorizontal: 4 },
  ampm:  { fontSize: 13, color: '#B8956A', marginLeft: 6 },
});

export default function SettingsScreen() {
  const user = auth.currentUser;
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [dogName, setDogName]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [savingDog, setSavingDog]     = useState(false);
  const [slots, setSlots]             = useState<Slot[]>(DEFAULT_SLOTS);
  const [skipHours, setSkipHours]     = useState<number>(2);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs]   = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const ref  = doc(db, 'households', HOUSEHOLD_ID);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          if (d.dogName)         setDogName(d.dogName);
          if (d.reminderPrefs?.slots)     setSlots(d.reminderPrefs.slots);
          if (d.reminderPrefs?.skipHours !== undefined) setSkipHours(d.reminderPrefs.skipHours);
        }
      } catch (e) { console.log(e); }
      setLoadingPrefs(false);
    }
    load();
  }, []);

  async function handleSaveName() {
    if (!displayName.trim()) return Alert.alert('Please enter a name');
    setSaving(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: displayName.trim() });
      Alert.alert('✅ Saved!', `Your name is now "${displayName.trim()}"`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  }

  async function handleSaveDogName() {
    if (!dogName.trim()) return Alert.alert('Please enter a dog name');
    setSavingDog(true);
    try {
      await setDoc(doc(db, 'households', HOUSEHOLD_ID), { dogName: dogName.trim() }, { merge: true });
      Alert.alert('✅ Saved!', `Dog name set to "${dogName.trim()}"`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSavingDog(false);
  }

  async function handleSaveReminders() {
    setSavingPrefs(true);
    try {
      await setDoc(doc(db, 'households', HOUSEHOLD_ID), { reminderPrefs: { slots, skipHours } }, { merge: true });
      await scheduleReminderNotifications(slots, skipHours);
      Alert.alert('✅ Reminders saved!');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSavingPrefs(false);
  }

  async function handleLogout() {
    Alert.alert('Log out?', 'You can log back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: async () => { await cancelOverdueReminders(); await signOut(auth); } },
    ]);
  }

  function toggleSlot(key: string) { setSlots(prev => prev.map(s => s.key === key ? { ...s, enabled: !s.enabled } : s)); }
  function updateTime(key: string, h: number, m: number) { setSlots(prev => prev.map(s => s.key === key ? { ...s, hour: h, minute: m } : s)); }

  if (loadingPrefs) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF6F1' }}>
      <ActivityIndicator size="large" color="#8B5E3C" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.safe}>
      <ScrollView contentContainerStyle={st.container}>
        <Text style={st.title}>⚙️ Settings</Text>

        {/* ── Dog name ── */}
        <View style={st.card}>
          <Text style={st.sectionTitle}>🐶 Your Dog</Text>
          <Text style={st.label}>Dog's name</Text>
          <TextInput style={st.input} placeholder="e.g. Balu, Max, Luna"
            placeholderTextColor="#C4A882" value={dogName} onChangeText={setDogName}
            autoCapitalize="words" />
          <Text style={st.hint}>Shared with all family members</Text>
          {savingDog
            ? <ActivityIndicator color="#8B5E3C" style={{ marginTop: 12 }} />
            : <TouchableOpacity style={st.saveBtn} onPress={handleSaveDogName}>
                <Text style={st.saveBtnText}>Save Dog Name</Text>
              </TouchableOpacity>
          }
        </View>

        {/* ── Profile ── */}
        <View style={st.card}>
          <Text style={st.sectionTitle}>👤 Your Profile</Text>
          <Text style={st.label}>Display name</Text>
          <TextInput style={st.input} placeholder="e.g. Dad, Mom, Shauli"
            placeholderTextColor="#C4A882" value={displayName} onChangeText={setDisplayName}
            autoCapitalize="words" />
          <Text style={st.hint}>Shown when you log a walk</Text>
          {saving
            ? <ActivityIndicator color="#8B5E3C" style={{ marginTop: 12 }} />
            : <TouchableOpacity style={st.saveBtn} onPress={handleSaveName}>
                <Text style={st.saveBtnText}>Save Name</Text>
              </TouchableOpacity>
          }
        </View>

        {/* ── Reminders ── */}
        <View style={st.card}>
          <Text style={st.sectionTitle}>⏰ Daily Reminders</Text>
          <Text style={st.hint}>Fires if your dog hasn't been walked by this time</Text>
          {slots.map(slot => (
            <View key={slot.key} style={st.slotRow}>
              <Switch value={slot.enabled} onValueChange={() => toggleSlot(slot.key)}
                trackColor={{ false: '#EDE0D4', true: '#8B5E3C' }} thumbColor="#fff" style={{ marginRight: 10 }} />
              <Text style={st.slotLabel}>{slot.label}</Text>
              <View style={{ flex: 1 }} />
              {slot.enabled
                ? <TimeEditor slot={slot} onChange={(h, m) => updateTime(slot.key, h, m)} />
                : <Text style={st.slotOff}>Off</Text>
              }
            </View>
          ))}

          <Text style={[st.label, { marginTop: 18 }]}>Skip if walked recently...</Text>
          {SKIP_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.value}
              style={[st.radioRow, skipHours === opt.value && st.radioRowActive]}
              onPress={() => setSkipHours(opt.value)}>
              <View style={[st.radio, skipHours === opt.value && st.radioActive]} />
              <Text style={[st.radioLabel, skipHours === opt.value && st.radioLabelActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}

          {savingPrefs
            ? <ActivityIndicator color="#8B5E3C" style={{ marginTop: 16 }} />
            : <TouchableOpacity style={st.saveBtn} onPress={handleSaveReminders}>
                <Text style={st.saveBtnText}>Save Reminders</Text>
              </TouchableOpacity>
          }
        </View>

        {/* ── Account ── */}
        <View style={st.card}>
          <Text style={st.sectionTitle}>Account</Text>
          <Text style={st.emailText}>📧 {user?.email}</Text>
          <TouchableOpacity style={st.logoutBtn} onPress={handleLogout}>
            <Text style={st.logoutBtnText}>🚪 Log Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FAF6F1' },
  container: { padding: 24, paddingBottom: 60 },
  title:     { fontSize: 28, fontWeight: '800', color: '#3d2b1f', marginBottom: 24 },
  card:      { backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: '#8B5E3C', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#B8956A', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5 },
  label:     { fontSize: 14, color: '#5C3D1E', marginBottom: 8 },
  hint:      { fontSize: 12, color: '#C4A882', marginBottom: 12 },
  input:     { backgroundColor: '#FAF6F1', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1.5, borderColor: '#EDE0D4', marginBottom: 6, color: '#3d2b1f' },
  saveBtn:   { backgroundColor: '#8B5E3C', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  slotRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#FAF6F1' },
  slotLabel: { fontSize: 15, color: '#3d2b1f', fontWeight: '600' },
  slotOff:   { fontSize: 14, color: '#C4A882' },
  radioRow:  { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginTop: 8, backgroundColor: '#FAF6F1', borderWidth: 1.5, borderColor: '#EDE0D4' },
  radioRowActive: { backgroundColor: '#FDF3E3', borderColor: '#8B5E3C' },
  radio:     { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#C4A882', marginRight: 10 },
  radioActive: { borderColor: '#8B5E3C', backgroundColor: '#8B5E3C' },
  radioLabel: { fontSize: 15, color: '#888' },
  radioLabelActive: { color: '#3d2b1f', fontWeight: '600' },
  emailText: { fontSize: 15, color: '#5C3D1E', marginBottom: 16 },
  logoutBtn: { backgroundColor: '#fdecea', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#e74c3c' },
  logoutBtnText: { color: '#e74c3c', fontSize: 16, fontWeight: '700' },
});
