import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View,
  SafeAreaView, ScrollView, ActivityIndicator
} from 'react-native';
import { db, auth } from '../../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { TimeOfDayIcon, formatTime, formatDuration } from '../../utils';
import { t, Lang } from '../../translations';

const HOUSEHOLD_ID = 'balu_family';

function formatDate(ts: number, lang: Lang): string {
  const d = new Date(ts);
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString())     return t(lang, 'today');
  if (d.toDateString() === yesterday.toDateString()) return t(lang, 'yesterday');
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupByDay(walks: any[]) {
  const groups: Record<string, any[]> = {};
  for (const walk of walks) {
    const key = getDayKey(walk.start);
    if (!groups[key]) groups[key] = [];
    groups[key].push(walk);
  }
  return groups;
}

function buildLeaderboard(walks: any[]) {
  const totals: Record<string, { count: number; duration: number }> = {};
  for (const walk of walks) {
    const name = walk.takenBy || 'Unknown';
    if (!totals[name]) totals[name] = { count: 0, duration: 0 };
    totals[name].count += 1;
    totals[name].duration += walk.duration ?? 0;
  }
  return Object.entries(totals)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count);
}

function StatCard({ label, value, sub, color, rtl }: {
  label: string; value: string; sub?: string; color: string; rtl?: boolean;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: rtl ? 'transparent' : color, borderRightColor: rtl ? color : 'transparent' }]}>
      <Text style={[styles.statValue, rtl && styles.rtl]}>{value}</Text>
      <Text style={[styles.statLabel, rtl && styles.rtl]}>{label}</Text>
      {sub && <Text style={[styles.statSub, rtl && styles.rtl]}>{sub}</Text>}
    </View>
  );
}

export default function HistoryScreen() {
  const [walkHistory, setWalkHistory] = useState<any[]>([]);
  const [dogName, setDogName]         = useState('');
  const [lang, setLang]               = useState<Lang>('en');
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const ref   = doc(db, 'households', HOUSEHOLD_ID);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setWalkHistory(d.walkHistory ?? []);
        setDogName(d.dogName ?? '');
        setLang((d.lang as Lang) || 'en');
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF6F1' }}>
      <ActivityIndicator size="large" color="#8B5E3C" />
    </SafeAreaView>
  );

  const isHe = lang === 'he';
  const today      = new Date().toDateString();
  const todayWalks = walkHistory.filter(w => new Date(w.start).toDateString() === today);
  const todayTotal = todayWalks.reduce((sum, w) => sum + (w.duration ?? 0), 0);
  const last7      = walkHistory.filter(w => (Date.now() - w.start) < 7 * 24 * 60 * 60 * 1000);
  const avgDur     = last7.length > 0 ? last7.reduce((s, w) => s + (w.duration ?? 0), 0) / last7.length : 0;
  const grouped    = groupByDay(walkHistory);
  const dayKeys    = Object.keys(grouped).sort((a, b) => grouped[b][0].start - grouped[a][0].start);
  const leaderboard = buildLeaderboard(last7);
  const medals     = ['🥇', '🥈', '🥉'];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.title, isHe && styles.rtl]}>
          📊 {dogName ? `${dogName}` : ''} {t(lang, 'stats')}
        </Text>

        <View style={[styles.statsRow, isHe && styles.rowRev]}>
          <StatCard
            label={t(lang, 'todayWalks')}
            value={`${todayWalks.length}`}
            sub={todayWalks.length > 0 ? formatDuration(todayTotal) : t(lang, 'none')}
            color="#8B5E3C" rtl={isHe}
          />
          <StatCard
            label={t(lang, 'thisWeek')}
            value={`${last7.length}`}
            sub={last7.length > 0 ? `${t(lang, 'avg')} ${formatDuration(avgDur)}` : t(lang, 'none')}
            color="#E8A838" rtl={isHe}
          />
        </View>

        {leaderboard.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isHe && styles.rtl]}>
              🏆 {t(lang, 'thisWeekWalkers')}
            </Text>
            {leaderboard.map((entry, i) => (
              <View key={entry.name} style={[styles.leaderRow, isHe && styles.rowRev]}>
                <Text style={styles.medal}>{medals[i] ?? '🐾'}</Text>
                <Text style={[styles.leaderName, isHe && styles.rtl]}>{entry.name}</Text>
                <Text style={styles.leaderCount}>{entry.count} {t(lang, 'walks')}</Text>
                <Text style={styles.leaderDur}>{formatDuration(entry.duration)}</Text>
              </View>
            ))}
          </View>
        )}

        {dayKeys.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isHe && styles.rtl]}>{t(lang, 'walkLog')}</Text>
            {dayKeys.map(key => {
              const dayWalks = grouped[key];
              const dayTotal = dayWalks.reduce((sum: number, w: any) => sum + (w.duration ?? 0), 0);
              return (
                <View key={key} style={styles.dayGroup}>
                  <View style={[styles.dayHeader, isHe && styles.rowRev]}>
                    <Text style={[styles.dayLabel, isHe && styles.rtl]}>{formatDate(dayWalks[0].start, lang)}</Text>
                    <Text style={styles.dayTotal}>{dayWalks.length} {t(lang, 'walks')} · {formatDuration(dayTotal)}</Text>
                  </View>
                  {dayWalks.map((walk: any) => (
                    <View key={walk.id} style={[styles.walkRow, isHe && styles.rowRev]}>
                      <TimeOfDayIcon ts={walk.start} size={38} />
                      <View style={[styles.walkInfo, isHe && { marginRight: 12, marginLeft: 0 }]}>
                        <Text style={[styles.walkTime, isHe && styles.rtl]}>{formatTime(walk.start)}</Text>
                        <Text style={[styles.walkWho, isHe && styles.rtl]}>{walk.takenBy}</Text>
                      </View>
                      <Text style={styles.walkDur}>{formatDuration(walk.duration)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🐾</Text>
            <Text style={[styles.emptyText, isHe && styles.rtl]}>{t(lang, 'noWalksYet')}</Text>
            <Text style={[styles.emptyHint, isHe && styles.rtl]}>{t(lang, 'goLog')}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#FAF6F1' },
  container:    { padding: 24, paddingBottom: 60 },
  title:        { fontSize: 28, fontWeight: '800', color: '#3d2b1f', marginBottom: 20 },
  rtl:          { textAlign: 'right', writingDirection: 'rtl' },
  rowRev:       { flexDirection: 'row-reverse' },
  statsRow:     { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard:     { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderLeftWidth: 4, borderRightWidth: 4, borderRightColor: 'transparent', shadowColor: '#8B5E3C', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  statValue:    { fontSize: 32, fontWeight: '800', color: '#3d2b1f' },
  statLabel:    { fontSize: 13, color: '#B8956A', marginTop: 2 },
  statSub:      { fontSize: 12, color: '#C4A882', marginTop: 4 },
  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#B8956A', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 },
  leaderRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#EDE0D4' },
  medal:        { fontSize: 20, marginRight: 10 },
  leaderName:   { flex: 1, fontSize: 16, fontWeight: '600', color: '#3d2b1f' },
  leaderCount:  { fontSize: 14, color: '#8B5E3C', fontWeight: '600', marginRight: 10 },
  leaderDur:    { fontSize: 13, color: '#C4A882' },
  dayGroup:     { marginBottom: 16 },
  dayHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  dayLabel:     { fontSize: 15, fontWeight: '700', color: '#3d2b1f' },
  dayTotal:     { fontSize: 13, color: '#B8956A' },
  walkRow:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#EDE0D4' },
  walkInfo:     { flex: 1, marginLeft: 12 },
  walkTime:     { fontSize: 15, color: '#3d2b1f', fontWeight: '700' },
  walkWho:      { fontSize: 12, color: '#B8956A', marginTop: 2 },
  walkDur:      { fontSize: 15, color: '#8B5E3C', fontWeight: '700' },
  emptyState:   { alignItems: 'center', marginTop: 60 },
  emptyEmoji:   { fontSize: 60, marginBottom: 16 },
  emptyText:    { fontSize: 20, fontWeight: '700', color: '#3d2b1f', marginBottom: 8 },
  emptyHint:    { fontSize: 14, color: '#C4A882', textAlign: 'center' },
});
