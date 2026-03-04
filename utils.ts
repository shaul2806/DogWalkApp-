// Returns a time-of-day emoji based on the hour
export function timeOfDayEmoji(ts: number): string {
  const hour = new Date(ts).getHours();
  if (hour >= 5  && hour < 8)  return '🌅'; // early morning
  if (hour >= 8  && hour < 12) return '🌤️'; // morning
  if (hour >= 12 && hour < 15) return '☀️'; // midday
  if (hour >= 15 && hour < 18) return '🌞'; // afternoon
  if (hour >= 18 && hour < 21) return '🌆'; // evening
  if (hour >= 21 && hour < 23) return '🌙'; // night
  return '🌑';                               // late night / midnight
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}
