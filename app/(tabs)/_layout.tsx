import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, Text } from 'react-native';

// Warm palette matching Balu's icon
const COLORS = {
  active:   '#8B5E3C',  // warm brown
  inactive: '#C4A882',  // muted tan
  bg:       '#FAF6F1',  // warm off-white
  border:   '#EDE0D4',  // soft divider
};

function TabIcon({ symbol }: { symbol: string }) {
  return <Text style={{ fontSize: 22 }}>{symbol}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.active,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarStyle: {
          backgroundColor: COLORS.bg,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: () => <TabIcon symbol="🐾" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: () => <TabIcon symbol="📊" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: () => <TabIcon symbol="⚙️" />,
        }}
      />
    </Tabs>
  );
}
