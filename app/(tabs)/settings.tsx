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

function formatSlotTime(hour: number, minute: number) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(minute)} ${ampm}`;
}

type Slot = { key: string; label: string; hour: number; minute: number; enabled: boolean };

// ── Mini time editor ──
function TimeEditor({ slot, onChange }: { slot: Slot; onChange: (h: number, m: number) => void }) {
  const [hourText, setHourText] = useState(slot.hour.toString());
  const [minText, setMinText] = useState(pad(slot.minute));

  function commit() {
    let h = parseInt(hourText, 10);
    let m = parseInt(minText, 10);
    if (isNaN(h) || h < 0 || h > 23) { h = slot.hour; setHourText(slot.hour.toString()); }
    if (isNaN(m) || m < 0 || m > 59) { m = slot.minute; setMinText(pad(slot.minute)); }
    setHourText(h.toString());
    setMinText(pad(m));
    onChange(h, m);
  }

  return (
    <View style={teStyles.row}>
      <TextInput
        style={teStyles.input}
        value={hourText}
        onChangeText={setHourText}
        onBlur={commit}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
      />
      <Text style={teStyles.colon}>:</Text>
      <TextInput
        style={teStyles.input}
        value={minText}
        onChangeText={setMinText}
        onBlur={commit}
        keyboardType="number-pad"
        maxLength={2}
        selectTextOnFocus
      />
      <Text style={teStyles.ampm}>{slot.hour >= 12 ? 'PM' : 'AM'}</Text>
    </View>
  );
}

const teStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: {
    backgroundColor: '#f4f6f8', borderRadius: 8, borderWidth: 1, borderColor: '#ddd',
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 16, fontWeight: '700',
    color: '#2c3e50', width: 42, textAlign: 'center',
  },
  colon: { fontSize: 18, fontWeight: '700', color: '#2c3e50', marginHorizontal: 4 },
  ampm: { fontSize: 13, color: '#888', marginLeft: 6 },
});

export default function SettingsScreen() {
  const user = auth.currentUser;
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [skipHours, setSkipHours] = useState<number>(2);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    async function loadPrefs() {
      try {
        const ref = doc(db, 'households', HOUSEHOLD_ID);
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().reminderPrefs) {
          const prefs = snap.data().reminderPrefs;
          if (prefs.slots) setSlots(prefs.slots);
          if (prefs.skipHours !== undefined) setSkipHours(prefs.skipHours);
        }
      } catch (e) { console.log('Could not load prefs:', e); }
      setLoadingPrefs(false);
    }
    loadPrefs();
  }, []);

  function updateSlotTime(key: string, hour: number, minute: number) {
    setSlots(prev => prev.map(s => s.key === key ? { ...s, hour, minute } : s));
  }

  function toggleSlot(key: string) {
    setSlots(prev => prev.map(s => s.key === key ? { ...s, enabled: !s.enabled } : s));
  }

  async function handleSaveName() {
    if (!displayName.trim()) return Alert.alert('Please enter a name');
    setSaving(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: displayName.trim() });
      Alert.alert('✅ Saved!', `Your name is now "${displayName.trim()}"`);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSaving(false);
  }

  async function handleSaveReminders() {
    setSavingPrefs(true);
    try {
      const ref = doc(db, 'households', HOUSEHOLD_ID);
      await setDoc(ref, { reminderPrefs: { slots, skipHours } }, { merge: true });
      await scheduleReminderNotifications(slots, skipHours);
      Alert.alert('✅ Reminders saved!', 'Schedule updated for all family members.');
    } catch (e: any) { Alert.alert('Error', e.message); }
    setSavingPrefs(false);
  }

  async function handleLogout() {
    Alert.alert('Log out?', 'You can log back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => { await cancelOverdueReminders(); await signOut(auth); },
      },
    ]);
  }

  if (loadingPrefs) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#3498db" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>⚙️ Settings</Text>

        {/* ── Profile ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Your Profile</Text>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Dad, Mom, Shauli"
            placeholderTextColor="#999"
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
          <Text style={styles.hint}>Shown when you log a walk</Text>
          {saving
            ? <ActivityIndicator color="#3498db" style={{ marginTop: 12 }} />
            : <TouchableOpacity style={styles.saveBtn} onPress={handleSaveName}>
                <Text style={styles.saveBtnText}>Save Name</Text>
              </TouchableOpacity>
          }
        </View>

        {/* ── Reminder Times ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>⏰ Daily Reminders</Text>
          <Text style={styles.hint}>Tap the time to edit it. Reminder fires if Balu hasn't walked yet.</Text>

          {slots.map(slot => (
            <View key={slot.key} style={styles.slotRow}>
              <Switch
                value={slot.enabled}
                onValueChange={() => toggleSlot(slot.key)}
                trackColor={{ false: '#ddd', true: '#3498db' }}
                thumbColor="#fff"
                style={{ marginRight: 12 }}
              />
              <Text style={styles.slotLabel}>{slot.label}</Text>
              <View style={{ flex: 1 }} />
              {slot.enabled
                ? <TimeEditor
                    slot={slot}
                    onChange={(h, m) => updateSlotTime(slot.key, h, m)}
                  />
                : <Text style={styles.slotDisabled}>Off</Text>
              }
            </View>
          ))}

          <Text style={[styles.label, { marginTop: 20 }]}>Skip reminder if Balu went out...</Text>
          {SKIP_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.skipOption, skipHours === opt.value && styles.skipOptionActive]}
              onPress={() => setSkipHours(opt.value)}
            >
              <View style={[styles.radioCircle, skipHours === opt.value && styles.radioCircleActive]} />
              <Text style={[styles.skipLabel, skipHours === opt.value && styles.skipLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}

          {savingPrefs
            ? <ActivityIndicator color="#3498db" style={{ marginTop: 16 }} />
            : <TouchableOpacity style={styles.saveBtn} onPress={handleSaveReminders}>
                <Text style={styles.saveBtnText}>Save Reminders</Text>
              </TouchableOpacity>
          }
        </View>

        {/* ── Account ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.emailText}>📧 {user?.email}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>🚪 Log Out</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f8' },
  container: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#2c3e50', marginBottom: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#888', marginBottom: 14,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  label: { fontSize: 14, color: '#555', marginBottom: 8 },
  hint: { fontSize: 12, color: '#aaa', marginBottom: 12 },
  input: {
    backgroundColor: '#f4f6f8', borderRadius: 12, padding: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 6,
  },
  saveBtn: {
    backgroundColor: '#3498db', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 12,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  slotRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  slotLabel: { fontSize: 15, color: '#2c3e50', fontWeight: '600' },
  slotDisabled: { fontSize: 14, color: '#ccc' },
  skipOption: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, marginTop: 8,
    backgroundColor: '#f4f6f8', borderWidth: 1, borderColor: '#e0e0e0',
  },
  skipOptionActive: { backgroundColor: '#eaf4fb', borderColor: '#3498db' },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: '#ccc', marginRight: 10,
  },
  radioCircleActive: { borderColor: '#3498db', backgroundColor: '#3498db' },
  skipLabel: { fontSize: 15, color: '#555' },
  skipLabelActive: { color: '#2c3e50', fontWeight: '600' },
  emailText: { fontSize: 15, color: '#555', marginBottom: 16 },
  logoutBtn: {
    backgroundColor: '#fdecea', borderRadius: 12,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e74c3c',
  },
  logoutBtnText: { color: '#e74c3c', fontSize: 16, fontWeight: '700' },
});
