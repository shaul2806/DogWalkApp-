import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  SafeAreaView, ScrollView, Alert, TextInput,
  ActivityIndicator, Animated
} from 'react-native';
import { db, auth } from '../../firebaseConfig';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, updateProfile, User
} from 'firebase/auth';
import {
  registerForPushNotifications, notifyFamily,
  scheduleOverdueReminders, cancelOverdueReminders,
} from '../../notifications';
import { TimeOfDayIcon, formatTime, formatDuration } from '../../utils';
import { t, Lang } from '../../translations';

const HOUSEHOLD_ID = 'balu_family';
const FALLBACK_DOG = 'Your Dog';

const SCHEDULE = [
  { from: 6,  to: 10, intervalHours: 4  },
  { from: 10, to: 18, intervalHours: 5  },
  { from: 18, to: 23, intervalHours: 4  },
  { from: 23, to: 6,  intervalHours: 11 },
];

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

function isNightTime() {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
}

function getStatusKey(lastWalkTime: number | null, isOut: boolean): 'GOOD' | 'SOON' | 'OVERDUE' | 'OUT' | 'NIGHT' {
  if (isOut) return 'OUT';
  if (isNightTime()) return 'NIGHT';
  if (!lastWalkTime) return 'OVERDUE';
  const hours    = (Date.now() - lastWalkTime) / (1000 * 60 * 60);
  const interval = getCurrentInterval();
  if (hours < interval * 0.65) return 'GOOD';
  if (hours < interval)        return 'SOON';
  return 'OVERDUE';
}

const STATUS_COLORS = {
  GOOD:    { color: '#27ae60', glow: '#2ecc7133', bg: '#f0faf4', emoji: '\uD83D\uDE0A' },
  SOON:    { color: '#e67e22', glow: '#f39c1233', bg: '#fef9f0', emoji: '\uD83D\uDD50' },
  OVERDUE: { color: '#e74c3c', glow: '#e74c3c44', bg: '#fef5f5', emoji: '\uD83C\uDD98' },
  OUT:     { color: '#2980b9', glow: '#3498db33', bg: '#f0f7ff', emoji: '\uD83D\uDEB6' },
  NIGHT:   { color: '#8e44ad', glow: '#8e44ad33', bg: '#faf5ff', emoji: '\uD83D\uDE34' },
};

const STATUS_LABEL_KEYS = {
  GOOD:    'allGood',
  SOON:    'walkSoon',
  OVERDUE: 'needsOut',
  OUT:     'onAWalk',
  NIGHT:   'sleeping',
} as const;

const STATUS_MSG_KEYS = {
  GOOD:    'msgAllGood',
  SOON:    'msgSoon',
  OVERDUE: 'msgOverdue',
  OUT:     'msgOut',
  NIGHT:   'msgNight',
} as const;

// PAW TAG
function PawTag({ color, glow, isOverdue }: { color: string; glow: string; isOverdue: boolean }) {
  const pulse   = useRef(new Animated.Value(1)).current;
  const shimmer = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    pulse.stopAnimation();
    shimmer.stopAnimation();
    if (isOverdue) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0,  duration: 600, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.setValue(1);
      Animated.loop(Animated.sequence([
        Animated.timing(shimmer, { toValue: 1.0, duration: 2200, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.6, duration: 2200, useNativeDriver: true }),
      ])).start();
    }
  }, [isOverdue, color]);

  const TOE = 24, PAD_W = 76, PAD_H = 66;

  return (
    <Animated.View style={[tag.container, { transform: [{ scale: pulse }] }]}>
      <Animated.View style={[tag.glow, { backgroundColor: glow, width: 170, height: 160, opacity: shimmer }]} />
      <View style={[tag.ring, { borderColor: color }]} />
      <View style={{ alignItems: 'center', paddingTop: 6 }}>
        <View style={tag.toeRow}>
          <View style={[tag.toe, { width: TOE * 0.82, height: TOE * 0.82, borderRadius: TOE * 0.45, backgroundColor: color, marginTop: 7, marginRight: 3 }]} />
          <View style={[tag.toe, { width: TOE,        height: TOE,         borderRadius: TOE * 0.5,  backgroundColor: color, marginRight: 2 }]} />
          <View style={[tag.toe, { width: TOE,        height: TOE,         borderRadius: TOE * 0.5,  backgroundColor: color, marginLeft:  2 }]} />
          <View style={[tag.toe, { width: TOE * 0.82, height: TOE * 0.82, borderRadius: TOE * 0.45, backgroundColor: color, marginTop: 7, marginLeft: 3 }]} />
        </View>
        <View style={[tag.pad, { width: PAD_W, height: PAD_H, backgroundColor: color }]}>
          <View style={tag.shine} />
        </View>
      </View>
    </Animated.View>
  );
}

const tag = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: 4, marginTop: 8 },
  glow:      { position: 'absolute', borderRadius: 999, top: 8 },
  ring:      { width: 22, height: 15, borderRadius: 11, borderWidth: 2.5, backgroundColor: 'transparent', marginBottom: -3, zIndex: 2 },
  toeRow:    { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 3 },
  toe:       { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
  pad:       { borderRadius: 36, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, elevation: 3, overflow: 'hidden' },
  shine:     { position: 'absolute', top: 10, left: 12, width: 20, height: 13, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.20)', transform: [{ rotate: '-18deg' }] },
});

// LOGIN
function LoginScreen({ onLogin, lang }: { onLogin: (u: User) => void; lang: Lang }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [isRegister, setIsRegister]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const isHe = lang === 'he';

  async function handleSubmit() {
    if (!email || !password) return Alert.alert(t(lang, 'enterEmail'));
    if (isRegister && !displayName) return Alert.alert(t(lang, 'enterName'));
    setLoading(true);
    try {
      let result;
      if (isRegister) {
        result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
      } else {
        result = await signInWithEmailAndPassword(auth, email, password);
      }
      onLogin(result.user);
    } catch (e: any) { Alert.alert('Error', e.message); }
    setLoading(false);
  }

  return (
    <SafeAreaView style={ls.safe}>
      <View style={ls.container}>
        <Text style={ls.paw}>🐾</Text>
        <Text style={ls.title}>{t(lang, 'appName')}</Text>
        <Text style={[ls.subtitle, isHe && ls.rtl]}>{t(lang, 'appSubtitle')}</Text>
        {isRegister && (
          <TextInput style={[ls.input, isHe && ls.rtlInput]} placeholder={t(lang, 'yourName')}
            placeholderTextColor="#aaa" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" />
        )}
        <TextInput style={[ls.input, isHe && ls.rtlInput]} placeholder={t(lang, 'emailAddress')}
          placeholderTextColor="#aaa" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={[ls.input, isHe && ls.rtlInput]} placeholder={t(lang, 'password')}
          placeholderTextColor="#aaa" value={password} onChangeText={setPassword} secureTextEntry />
        {loading
          ? <ActivityIndicator size="large" color="#8B5E3C" style={{ marginTop: 20 }} />
          : <TouchableOpacity style={ls.btn} onPress={handleSubmit}>
              <Text style={ls.btnText}>{isRegister ? t(lang, 'createAccount') : t(lang, 'signIn')}</Text>
            </TouchableOpacity>
        }
        <TouchableOpacity onPress={() => setIsRegister(!isRegister)} style={{ marginTop: 16 }}>
          <Text style={[ls.toggle, isHe && ls.rtl]}>
            {isRegister ? t(lang, 'alreadyHave') : t(lang, 'newUser')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// MAIN
export default function HomeScreen() {
  const [user, setUser]                   = useState<User | null>(null);
  const [authReady, setAuthReady]         = useState(false);
  const [dogName, setDogName]             = useState(FALLBACK_DOG);
  const [lang, setLang]                   = useState<Lang>('en');
  const [lastWalkTime, setLastWalkTime]   = useState<number | null>(null);
  const [isOut, setIsOut]                 = useState(false);
  const [walkStartTime, setWalkStartTime] = useState<number | null>(null);
  const [currentWalker, setCurrentWalker] = useState('');
  const [walkHistory, setWalkHistory]     = useState<any[]>([]);
  const [, setNow]                        = useState(Date.now());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    registerForPushNotifications(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const ref   = doc(db, 'households', HOUSEHOLD_ID);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setDogName(d.dogName || FALLBACK_DOG);
        setLang((d.lang as Lang) || 'en');
        setLastWalkTime(d.lastWalkTime ?? null);
        setIsOut(d.isOut ?? false);
        setWalkStartTime(d.walkStartTime ?? null);
        setCurrentWalker(d.currentWalker ?? '');
        setWalkHistory(d.walkHistory ?? []);
      }
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (isNightTime()) { cancelOverdueReminders(); return; }
    if (getStatusKey(lastWalkTime, isOut) === 'OVERDUE') scheduleOverdueReminders();
    else cancelOverdueReminders();
  }, [lastWalkTime, isOut, user?.uid]);

  if (!authReady) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF6F1' }}>
      <ActivityIndicator size="large" color="#8B5E3C" />
    </SafeAreaView>
  );

  if (!user) return <LoginScreen onLogin={setUser} lang={lang} />;

  const statusKey  = getStatusKey(lastWalkTime, isOut);
  const status     = STATUS_COLORS[statusKey];
  const isOverdue  = statusKey === 'OVERDUE';
  const isHe       = lang === 'he';
  const hoursSince = lastWalkTime ? ((Date.now() - lastWalkTime) / 3600000).toFixed(1) : null;
  const walkerName = user.displayName || user.email?.split('@')[0] || 'Someone';

  async function handleTakeOut() {
    const now = Date.now();
    await setDoc(doc(db, 'households', HOUSEHOLD_ID), {
      isOut: true, walkStartTime: now, currentWalker: walkerName,
      lastWalkTime, walkHistory, dogName, lang,
    });
    await notifyFamily(user.uid, `${dogName} ${t(lang, 'out')}`, `${walkerName} ${t(lang, 'takingOut')} ${dogName}`);
    await cancelOverdueReminders();
  }

  async function handleBackHome() {
    const endTime  = Date.now();
    const duration = endTime - (walkStartTime ?? endTime);
    const newEntry = { id: endTime, start: walkStartTime, end: endTime, duration, takenBy: walkerName };
    await setDoc(doc(db, 'households', HOUSEHOLD_ID), {
      isOut: false, walkStartTime: null, currentWalker: '',
      lastWalkTime: endTime, dogName, lang,
      walkHistory: [newEntry, ...walkHistory].slice(0, 20),
    });
    Alert.alert(`${t(lang, 'walkLogged')} 🐾`, `${t(lang, 'greatWalk')} — ${formatDuration(duration)}`);
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: status.bg }]}>
      <ScrollView contentContainerStyle={s.container}>

        <View style={[s.header, isHe && s.rowRev]}>
          <View>
            <Text style={[s.appTitle, isHe && s.rtl]}>POWSIGNAL</Text>
            <Text style={[s.dogName, isHe && s.rtl]}>{dogName} 🐶</Text>
          </View>
          <View style={s.userPill}>
            <Text style={[s.userPillText, isHe && s.rtl]}>👤 {walkerName}</Text>
          </View>
        </View>

        <View style={[s.statusCard, { borderColor: status.color + '33' }]}>
          <PawTag color={status.color} glow={status.glow} isOverdue={isOverdue} />
          <Text style={[s.statusLabel, { color: status.color }, isHe && s.rtl]}>
            {status.emoji}  {t(lang, STATUS_LABEL_KEYS[statusKey])}
          </Text>
          <Text style={[s.statusMsg, isHe && s.rtl]}>{t(lang, STATUS_MSG_KEYS[statusKey])}</Text>
          <View style={[s.metaRow, isHe && s.rowRev]}>
            {isOut && currentWalker && (
              <View style={[s.metaPill, { backgroundColor: status.color + '18' }]}>
                <Text style={[s.metaText, { color: status.color }, isHe && s.rtl]}>
                  🚶 {currentWalker} {t(lang, 'isWalking')}
                </Text>
              </View>
            )}
            {lastWalkTime && !isOut && (
              <View style={[s.metaPill, { backgroundColor: status.color + '18' }]}>
                <Text style={[s.metaText, { color: status.color }, isHe && s.rtl]}>
                  {isHe
                    ? `${t(lang, 'last')}: ${formatTime(lastWalkTime)} · ${t(lang, 'ago')} ${hoursSince}${t(lang, 'hAgo').split(' ')[0]}`
                    : `${t(lang, 'last')}: ${formatTime(lastWalkTime)} · ${hoursSince}h ${t(lang, 'ago')}`
                  }
                </Text>
              </View>
            )}
            {isOut && walkStartTime && (
              <View style={[s.metaPill, { backgroundColor: status.color + '18' }]}>
                <Text style={[s.metaText, { color: status.color }, isHe && s.rtl]}>
                  {t(lang, 'startedAt')} {formatTime(walkStartTime)}
                </Text>
              </View>
            )}
            {!isNightTime() && (
              <View style={s.metaPill}>
                <Text style={[s.metaText, isHe && s.rtl]}>
                  ⏱ {getCurrentInterval()} {t(lang, 'hWindow')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {!isOut ? (
          <TouchableOpacity style={[s.btn, { backgroundColor: status.color }]} onPress={handleTakeOut}>
            <Text style={s.btnText}>🐾  {t(lang, 'takingOut')} {dogName} {t(lang, 'out')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.btn, { backgroundColor: '#27ae60' }]} onPress={handleBackHome}>
            <Text style={s.btnText}>🏠  {t(lang, 'backHome')}</Text>
          </TouchableOpacity>
        )}

        {walkHistory.length > 0 && (
          <View style={s.historySection}>
            <Text style={[s.historyTitle, isHe && s.rtl]}>{t(lang, 'recentWalks')}</Text>
            {walkHistory.map((entry: any) => (
              <View key={entry.id} style={[s.historyRow, isHe && s.rowRev]}>
                <TimeOfDayIcon ts={entry.start} size={38} />
                <View style={[s.historyInfo, isHe && { marginRight: 12, marginLeft: 0 }]}>
                  <Text style={[s.historyTime, isHe && s.rtl]}>{formatTime(entry.start)}</Text>
                  <Text style={[s.historyWho, isHe && s.rtl]}>{entry.takenBy}</Text>
                </View>
                <Text style={s.historyDur}>{formatDuration(entry.duration)}</Text>
              </View>
            ))}
          </View>
        )}

        {walkHistory.length === 0 && !isOut && (
          <Text style={[s.noHistory, isHe && s.rtl]}>{t(lang, 'noWalks')} 🐾</Text>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const ls = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FAF6F1' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  paw:       { fontSize: 64, marginBottom: 8 },
  title:     { fontSize: 32, fontWeight: '800', color: '#8B5E3C', textAlign: 'center' },
  subtitle:  { fontSize: 15, color: '#B8956A', marginBottom: 36, textAlign: 'center' },
  rtl:       { textAlign: 'right', writingDirection: 'rtl' },
  input:     { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#EDE0D4', color: '#3d2b1f' },
  rtlInput:  { textAlign: 'right' },
  btn:       { width: '100%', backgroundColor: '#8B5E3C', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 8 },
  btnText:   { color: '#fff', fontSize: 17, fontWeight: '700' },
  toggle:    { color: '#8B5E3C', fontSize: 14 },
});

const s = StyleSheet.create({
  safe:         { flex: 1 },
  container:    { padding: 24, paddingBottom: 60 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 8 },
  rowRev:       { flexDirection: 'row-reverse' },
  rtl:          { textAlign: 'right', writingDirection: 'rtl' },
  appTitle:     { fontSize: 11, color: '#C4A882', fontWeight: '700', letterSpacing: 3 },
  dogName:      { fontSize: 28, fontWeight: '800', color: '#3d2b1f', marginTop: 2 },
  userPill:     { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#EDE0D4' },
  userPillText: { fontSize: 13, color: '#8B5E3C', fontWeight: '600' },
  statusCard:   { backgroundColor: '#fff', borderRadius: 28, borderWidth: 2, padding: 28, alignItems: 'center', marginBottom: 20, shadowColor: '#8B5E3C', shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 },
  statusLabel:  { fontSize: 24, fontWeight: '800', marginBottom: 6, marginTop: 4 },
  statusMsg:    { fontSize: 15, color: '#888', marginBottom: 16 },
  metaRow:      { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  metaPill:     { backgroundColor: '#F5EDE4', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  metaText:     { fontSize: 13, color: '#8B5E3C', fontWeight: '500' },
  btn:          { width: '100%', padding: 20, borderRadius: 18, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  btnText:      { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.3 },
  historySection: { marginTop: 8 },
  historyTitle:   { fontSize: 16, fontWeight: '700', color: '#3d2b1f', marginBottom: 12 },
  historyRow:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EDE0D4' },
  historyInfo:    { flex: 1, marginLeft: 12 },
  historyTime:    { fontSize: 15, color: '#3d2b1f', fontWeight: '700' },
  historyWho:     { fontSize: 12, color: '#B8956A', marginTop: 2 },
  historyDur:     { fontSize: 15, color: '#8B5E3C', fontWeight: '700' },
  noHistory:      { textAlign: 'center', color: '#C4A882', marginTop: 32, fontSize: 15 },
});
