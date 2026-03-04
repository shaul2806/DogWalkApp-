import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  SafeAreaView, ScrollView, Alert, TextInput, ActivityIndicator
} from 'react-native';
import { db, auth } from '../../firebaseConfig';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';

// ─── CONFIG ────────────────────────────────────────────
const DOG_NAME = "Balu";
const HOUSEHOLD_ID = "balu_family";

const SCHEDULE = [
  { label: "Morning",   from: 6,  to: 10, intervalHours: 4  },
  { label: "Daytime",   from: 10, to: 18, intervalHours: 5  },
  { label: "Evening",   from: 18, to: 23, intervalHours: 4  },
  { label: "Night",     from: 23, to: 6,  intervalHours: 11 },
];
// ───────────────────────────────────────────────────────

function getCurrentInterval(): number {
  const hour = new Date().getHours();
  for (const slot of SCHEDULE) {
    if (slot.from < slot.to) {
      if (hour >= slot.from && hour < slot.to) return slot.intervalHours;
    } else {
      if (hour >= slot.from || hour < slot.to) return slot.intervalHours;
    }
  }
  return 6;
}

const STATUS = {
  GOOD:    { label: 'All Good 🟢',  color: '#2ecc71', bg: '#eafaf1', msg: `${DOG_NAME} is all good!` },
  SOON:    { label: 'Soon 🟡',      color: '#f1c40f', bg: '#fefde7', msg: 'Getting close to walk time...' },
  OVERDUE: { label: 'Needs Out 🔴', color: '#e74c3c', bg: '#fdecea', msg: 'Take me out please! 🐶' },
  OUT:     { label: 'Out Now 🔵',   color: '#3498db', bg: '#eaf4fb', msg: 'Currently on a walk!' },
  NIGHT:   { label: 'Sleeping 🌙',  color: '#8e44ad', bg: '#f5eef8', msg: 'Night time — all good' },
};

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 6;
}

function getStatus(lastWalkTime: number | null, isOut: boolean) {
  if (isOut) return STATUS.OUT;
  if (isNightTime()) return STATUS.NIGHT;
  if (!lastWalkTime) return STATUS.OVERDUE;
  const hours = (Date.now() - lastWalkTime) / (1000 * 60 * 60);
  const interval = getCurrentInterval();
  if (hours < interval * 0.65) return STATUS.GOOD;
  if (hours < interval) return STATUS.SOON;
  return STATUS.OVERDUE;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

// ─── LOGIN SCREEN ───────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return Alert.alert('Please enter email and password');
    setLoading(true);
    try {
      let result;
      if (isRegister) {
        result = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        result = await signInWithEmailAndPassword(auth, email, password);
      }
      onLogin(result.user);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  }

  return (
    <SafeAreaView style={loginStyles.safe}>
      <View style={loginStyles.container}>
        <Text style={loginStyles.emoji}>🐾</Text>
        <Text style={loginStyles.title}>DogWalk</Text>
        <Text style={loginStyles.subtitle}>{DOG_NAME}'s family app</Text>

        <TextInput
          style={loginStyles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={loginStyles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {loading ? (
          <ActivityIndicator size="large" color="#3498db" style={{ marginTop: 20 }} />
        ) : (
          <TouchableOpacity style={loginStyles.btn} onPress={handleSubmit}>
            <Text style={loginStyles.btnText}>{isRegister ? 'Create Account' : 'Sign In'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{ marginTop: 16 }}>
          <Text style={loginStyles.toggle}>
            {isRegister ? 'Already have an account? Sign in' : 'New user? Create account'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── MAIN APP ───────────────────────────────────────────
export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [lastWalkTime, setLastWalkTime] = useState<number | null>(null);
  const [isOut, setIsOut] = useState(false);
  const [walkStartTime, setWalkStartTime] = useState<number | null>(null);
  const [currentWalker, setCurrentWalker] = useState<string>('');
  const [walkHistory, setWalkHistory] = useState<any[]>([]);
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 Real-time sync — every family member sees the same state instantly
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLastWalkTime(data.lastWalkTime ?? null);
        setIsOut(data.isOut ?? false);
        setWalkStartTime(data.walkStartTime ?? null);
        setCurrentWalker(data.currentWalker ?? '');
        setWalkHistory(data.walkHistory ?? []);
      }
    });
    return unsub;
  }, [user]);

  const status = getStatus(lastWalkTime, isOut);
  const hoursSince = lastWalkTime
    ? ((Date.now() - lastWalkTime) / (1000 * 60 * 60)).toFixed(1)
    : null;
  const walkerName = user?.email?.split('@')[0] ?? 'Someone';

  async function handleTakeOut() {
    const now = Date.now();
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    await setDoc(ref, {
      isOut: true,
      walkStartTime: now,
      currentWalker: walkerName,
      lastWalkTime,
      walkHistory,
    });
  }

  async function handleBackHome() {
    const endTime = Date.now();
    const duration = endTime - (walkStartTime ?? endTime);
    const newEntry = { id: endTime, start: walkStartTime, end: endTime, duration, takenBy: walkerName };
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    await setDoc(ref, {
      isOut: false,
      walkStartTime: null,
      currentWalker: '',
      lastWalkTime: endTime,
      walkHistory: [newEntry, ...walkHistory].slice(0, 10),
    });
    Alert.alert('Walk logged! 🐾', `Great walk — ${formatDuration(duration)}`);
  }

  if (!authReady) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#3498db" />
    </SafeAreaView>
  );

  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: status.bg }]}>
      <ScrollView contentContainerStyle={styles.container}>

        <Text style={styles.appTitle}>🐾 DogWalk</Text>
        <Text style={styles.dogName}>{DOG_NAME}</Text>
        <Text style={styles.userBadge}>👤 {walkerName}</Text>

        <View style={[styles.statusCard, { borderColor: status.color }]}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          <Text style={styles.statusMsg}>{status.msg}</Text>
          {isOut && currentWalker && (
            <Text style={styles.subText}>🚶 {currentWalker} is on the walk</Text>
          )}
          {lastWalkTime && !isOut && (
            <Text style={styles.subText}>Last walk: {formatTime(lastWalkTime)}  ({hoursSince}h ago)</Text>
          )}
          {isOut && walkStartTime && (
            <Text style={styles.subText}>Started at {formatTime(walkStartTime)}</Text>
          )}
          {!isNightTime() && (
            <Text style={styles.subText}>Window: {getCurrentInterval()}h</Text>
          )}
        </View>

        {!isOut ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#3498db' }]} onPress={handleTakeOut}>
            <Text style={styles.btnText}>🚶 Taking {DOG_NAME} Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#2ecc71' }]} onPress={handleBackHome}>
            <Text style={styles.btnText}>🏠 Back Home — Log Walk</Text>
          </TouchableOpacity>
        )}

        {walkHistory.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Walks</Text>
            {walkHistory.map((entry: any) => (
              <View key={entry.id} style={styles.historyRow}>
                <Text style={styles.historyTime}>{formatTime(entry.start)}</Text>
                <Text style={styles.historyDur}>{formatDuration(entry.duration)}</Text>
                <Text style={styles.historyWho}>{entry.takenBy}</Text>
              </View>
            ))}
          </View>
        )}

        {walkHistory.length === 0 && !isOut && (
          <Text style={styles.noHistory}>No walks logged yet today</Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const loginStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eaf4fb' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 60, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: '800', color: '#2c3e50' },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 32 },
  input: {
    width: '100%', backgroundColor: '#fff', borderRadius: 12,
    padding: 16, fontSize: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#ddd',
  },
  btn: { width: '100%', backgroundColor: '#3498db', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  toggle: { color: '#3498db', fontSize: 14 },
});

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { alignItems: 'center', padding: 24, paddingBottom: 60 },
  appTitle: { fontSize: 16, color: '#888', marginTop: 10, letterSpacing: 2 },
  dogName: { fontSize: 42, fontWeight: '800', color: '#2c3e50', marginBottom: 4 },
  userBadge: { fontSize: 14, color: '#888', marginBottom: 20 },
  statusCard: {
    width: '100%', borderRadius: 24, borderWidth: 3,
    backgroundColor: '#fff', padding: 28, alignItems: 'center', marginBottom: 28,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  statusDot: {
    width: 80, height: 80, borderRadius: 40, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  statusLabel: { fontSize: 26, fontWeight: '700', marginBottom: 6 },
  statusMsg: { fontSize: 16, color: '#666', marginBottom: 6 },
  subText: { fontSize: 13, color: '#999', marginTop: 4 },
  btn: {
    width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  historySection: { width: '100%', marginTop: 16 },
  historyTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50', marginBottom: 12 },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  historyTime: { fontSize: 15, color: '#2c3e50', fontWeight: '600' },
  historyDur: { fontSize: 15, color: '#3498db', fontWeight: '600' },
  historyWho: { fontSize: 15, color: '#888' },
  noHistory: { color: '#aaa', marginTop: 24, fontSize: 14 },
});
