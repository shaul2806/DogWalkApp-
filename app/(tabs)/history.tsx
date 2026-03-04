import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View,
  SafeAreaView, ScrollView, ActivityIndicator
} from 'react-native';
import { db, auth } from '../../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { timeOfDayEmoji, formatTime, formatDuration } from '../../utils';

const DOG_NAME = 'Balu';
const HOUSEHOLD_ID = 'balu_family';

function formatDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
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

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

export default function HistoryScreen() {
  const [walkHistory, setWalkHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) setWalkHistory(snap.data().walkHistory ?? []);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#3498db" />
    </SafeAreaView>
  );

  const today = new Date().toDateString();
  const todayWalks = walkHistory.filter(w => new Date(w.start).toDateString() === today);
  const todayTotal = todayWalks.reduce((sum, w) => sum + (w.duration ?? 0), 0);

  const last7Days = walkHistory.filter(w => (Date.now() - w.start) < 7 * 24 * 60 * 60 * 1000);
  const avgDuration = last7Days.length > 0
    ? last7Days.reduce((sum, w) => sum + (w.duration ?? 0), 0) / last7Days.length
    : 0;

  const grouped = groupByDay(walkHistory);
  const dayKeys = Object.keys(grouped).sort((a, b) => grouped[b][0].start - grouped[a][0].start);
  const leaderboard = buildLeaderboard(last7Days);
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📊 {DOG_NAME}'s Stats</Text>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatCard
            label="Today's walks"
            value={`${todayWalks.length}`}
            sub={todayWalks.length > 0 ? formatDuration(todayTotal) + ' total' : 'None yet'}
            color="#3498db"
          />
          <StatCard
            label="This week"
            value={`${last7Days.length}`}
            sub={last7Days.length > 0 ? 'avg ' + formatDuration(avgDuration) : 'No walks'}
            color="#2ecc71"
          />
        </View>

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 This Week's Walkers</Text>
            {leaderboard.map((entry, i) => (
              <View key={entry.name} style={styles.leaderRow}>
                <Text style={styles.medal}>{medals[i] ?? '🐾'}</Text>
                <Text style={styles.leaderName}>{entry.name}</Text>
                <Text style={styles.leaderCount}>{entry.count} walk{entry.count !== 1 ? 's' : ''}</Text>
                <Text style={styles.leaderDur}>{formatDuration(entry.duration)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Walk log grouped by day */}
        {dayKeys.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Walk Log</Text>
            {dayKeys.map(key => {
              const dayWalks = grouped[key];
              const dayTotal = dayWalks.reduce((sum: number, w: any) => sum + (w.duration ?? 0), 0);
              return (
                <View key={key} style={styles.dayGroup}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>{formatDate(dayWalks[0].start)}</Text>
                    <Text style={styles.dayTotal}>{dayWalks.length} walks · {formatDuration(dayTotal)}</Text>
                  </View>
                  {dayWalks.map((walk: any) => (
                    <View key={walk.id} style={styles.walkRow}>
                      <Text style={styles.walkEmoji}>{timeOfDayEmoji(walk.start)}</Text>
                      <Text style={styles.walkTime}>{formatTime(walk.start)}</Text>
                      <Text style={styles.walkDur}>{formatDuration(walk.duration)}</Text>
                      <Text style={styles.walkWho}>{walk.takenBy}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🐾</Text>
            <Text style={styles.emptyText}>No walks logged yet</Text>
            <Text style={styles.emptyHint}>Head to the home tab and log your first walk!</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f6f8' },
  container: { padding: 24, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#2c3e50', marginBottom: 20 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, borderLeftWidth: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statValue: { fontSize: 32, fontWeight: '800', color: '#2c3e50' },
  statLabel: { fontSize: 13, color: '#888', marginTop: 2 },
  statSub: { fontSize: 12, color: '#aaa', marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16, fontWeight: '700', color: '#888',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  medal: { fontSize: 20, marginRight: 10 },
  leaderName: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2c3e50' },
  leaderCount: { fontSize: 14, color: '#3498db', fontWeight: '600', marginRight: 10 },
  leaderDur: { fontSize: 13, color: '#aaa' },
  dayGroup: { marginBottom: 16 },
  dayHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  dayLabel: { fontSize: 15, fontWeight: '700', color: '#2c3e50' },
  dayTotal: { fontSize: 13, color: '#888' },
  walkRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  walkEmoji: { fontSize: 18, marginRight: 8 },
  walkTime: { fontSize: 14, color: '#2c3e50', fontWeight: '600', marginRight: 8 },
  walkDur: { flex: 1, fontSize: 14, color: '#3498db', fontWeight: '600' },
  walkWho: { fontSize: 14, color: '#888' },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyEmoji: { fontSize: 60, marginBottom: 16 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#2c3e50', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#aaa', textAlign: 'center' },
});
