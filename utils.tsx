import React from 'react';
import { View, StyleSheet } from 'react-native';

// ── Time of day ─────────────────────────────────────────
export function getTimeOfDay(ts: number): 'morning' | 'noon' | 'evening' | 'night' {
  const hour = new Date(ts).getHours();
  if (hour >= 5  && hour < 11) return 'morning';
  if (hour >= 11 && hour < 16) return 'noon';
  if (hour >= 16 && hour < 21) return 'evening';
  return 'night';
}

const SUN  = '#E8A838';
const LINE = '#3d2b1f';
const MOON = '#C8A84B';
const BG   = '#FDF6E8';
const BG_N = '#F0EDF8';

export function TimeOfDayIcon({ ts, size = 38 }: { ts: number; size?: number }) {
  const tod = getTimeOfDay(ts);
  const s   = size;
  const r   = s * 0.21;

  if (tod === 'morning') {
    return (
      <View style={[st.wrap, { width: s, height: s, borderRadius: s / 2, backgroundColor: BG }]}>
        {[-40, -20, 0, 20, 40].map((angle, i) => {
          const rad = angle * Math.PI / 180;
          return (
            <View key={i} style={{
              position: 'absolute',
              bottom: s * 0.36 + r + 2,
              left: s / 2 - 0.9 + Math.sin(rad) * (r + 4),
              width: 1.8, height: s * 0.13,
              backgroundColor: LINE, borderRadius: 2,
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}
        <View style={{
          position: 'absolute', bottom: s * 0.33,
          width: r * 2, height: r,
          borderTopLeftRadius: r, borderTopRightRadius: r,
          backgroundColor: SUN,
        }} />
        <View style={{
          position: 'absolute', bottom: s * 0.31,
          width: s * 0.72, height: 1.8,
          backgroundColor: LINE, borderRadius: 1,
        }} />
      </View>
    );
  }

  if (tod === 'noon') {
    const dist = r + s * 0.08;
    return (
      <View style={[st.wrap, { width: s, height: s, borderRadius: s / 2, backgroundColor: BG }]}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
          const rad = (angle - 90) * Math.PI / 180;
          return (
            <View key={i} style={{
              position: 'absolute',
              width: 1.8, height: s * 0.12,
              backgroundColor: LINE, borderRadius: 2,
              left: s / 2 - 0.9 + Math.cos(rad) * dist,
              top:  s / 2 - s * 0.06 + Math.sin(rad) * dist,
              transform: [{ rotate: `${angle}deg` }],
            }} />
          );
        })}
        <View style={{
          width: r * 2, height: r * 2, borderRadius: r,
          backgroundColor: SUN,
          borderWidth: 1.5, borderColor: LINE,
        }} />
      </View>
    );
  }

  if (tod === 'evening') {
    const lineWidths = [s * 0.62, s * 0.50, s * 0.38];
    return (
      <View style={[st.wrap, { width: s, height: s, borderRadius: s / 2, backgroundColor: BG }]}>
        <View style={{
          position: 'absolute', bottom: s * 0.38,
          width: r * 2, height: r,
          borderTopLeftRadius: r, borderTopRightRadius: r,
          backgroundColor: SUN,
        }} />
        <View style={{
          position: 'absolute', bottom: s * 0.36,
          width: s * 0.72, height: 1.8,
          backgroundColor: LINE, borderRadius: 1,
        }} />
        {lineWidths.map((w, i) => (
          <View key={i} style={{
            position: 'absolute',
            bottom: s * 0.26 - i * (s * 0.072),
            width: w, height: 1.8,
            backgroundColor: LINE, borderRadius: 1,
          }} />
        ))}
      </View>
    );
  }

  // night
  return (
    <View style={[st.wrap, { width: s, height: s, borderRadius: s / 2, backgroundColor: BG_N }]}>
      <View style={{
        position: 'absolute',
        left: s * 0.15, top: s * 0.18,
        width: r * 2.2, height: r * 2.2,
        borderRadius: r * 1.1,
        backgroundColor: MOON,
      }} />
      <View style={{
        position: 'absolute',
        left: s * 0.28, top: s * 0.13,
        width: r * 1.9, height: r * 1.9,
        borderRadius: r * 0.95,
        backgroundColor: BG_N,
      }} />
      <View style={{ position: 'absolute', right: s * 0.14, top: s * 0.20, width: 4.5, height: 4.5, borderRadius: 2.5, backgroundColor: MOON }} />
      <View style={{ position: 'absolute', right: s * 0.20, top: s * 0.40, width: 3, height: 3, borderRadius: 1.5, backgroundColor: MOON }} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

// ── Helpers ──────────────────────────────────────────────
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

export function timeOfDayEmoji(ts: number): string {
  const t = getTimeOfDay(ts);
  if (t === 'morning') return 'morning';
  if (t === 'noon')    return 'noon';
  if (t === 'evening') return 'evening';
  return 'night';
}
