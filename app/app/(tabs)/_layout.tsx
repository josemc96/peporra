import { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import type { ColorValue } from 'react-native';

import { useCurrentGroup } from '@/context/CurrentGroupContext';

// tabBarIcon functions defined outside to avoid new references on every render
function IconSoccer({ color, size }: { color: ColorValue; size: number }) {
  return <MaterialCommunityIcons name="soccer" size={size} color={color as string} />;
}
function IconGroup({ color, size }: { color: ColorValue; size: number }) {
  return <MaterialCommunityIcons name="account-group" size={size} color={color as string} />;
}
function IconField({ color, size }: { color: ColorValue; size: number }) {
  return <MaterialCommunityIcons name="soccer-field" size={size} color={color as string} />;
}
function IconProfile({ color, size }: { color: ColorValue; size: number }) {
  return <MaterialCommunityIcons name="account-circle" size={size} color={color as string} />;
}

export default function TabLayout() {
  const theme = useTheme();
  const { group } = useCurrentGroup();
  const inGroup = !!group;

  const screenOptions = useMemo(() => ({
    headerStyle: { backgroundColor: theme.colors.surface },
    headerTintColor: theme.colors.onSurface,
    headerShadowVisible: false,
    tabBarStyle: { display: 'none' as const },
  }), [
    theme.colors.surface,
    theme.colors.onSurface,
  ]);

  const indexOptions = useMemo(() => ({
    href: inGroup ? null : undefined,
    title: 'Peñas',
    tabBarIcon: IconSoccer,
  }), [inGroup]);

  const groupOptions = useMemo(() => ({
    href: inGroup ? undefined : null,
    title: 'Peña',
    tabBarIcon: IconGroup,
  }), [inGroup]);

  const predictionsOptions = useMemo(() => ({
    href: inGroup ? undefined : null,
    title: 'Predicciones',
    tabBarIcon: IconField,
  }), [inGroup]);

  const profileOptions = useMemo(() => ({
    title: inGroup ? 'Usuario' : 'Perfil',
    tabBarIcon: IconProfile,
  }), [inGroup]);

  return (
    <Tabs
      initialRouteName={inGroup ? 'predictions' : 'index'}
      screenOptions={screenOptions}
    >
      <Tabs.Screen name="index"       options={indexOptions} />
      <Tabs.Screen name="group"       options={groupOptions} />
      <Tabs.Screen name="predictions" options={predictionsOptions} />
      <Tabs.Screen name="profile"     options={profileOptions} />
    </Tabs>
  );
}
