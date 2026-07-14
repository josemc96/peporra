import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';

import { useCurrentGroup } from '@/context/CurrentGroupContext';

export default function TabLayout() {
  const theme = useTheme();
  const { group } = useCurrentGroup();
  const inGroup = !!group;

  return (
    <Tabs
      initialRouteName={inGroup ? 'predictions' : 'index'}
      screenOptions={{ tabBarActiveTintColor: theme.colors.primary }}
    >
      {/* Sin peña */}
      <Tabs.Screen
        name="index"
        options={{
          href: inGroup ? null : undefined,
          title: 'Peñas',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="soccer" size={size} color={color} />
          ),
        }}
      />

      {/* En peña */}
      <Tabs.Screen
        name="group"
        options={{
          href: inGroup ? undefined : null,
          title: 'Peña',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-group" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="predictions"
        options={{
          href: inGroup ? undefined : null,
          title: 'Predicciones',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="soccer-field" size={size} color={color} />
          ),
        }}
      />

      {/* Siempre visible */}
      <Tabs.Screen
        name="profile"
        options={{
          title: inGroup ? 'Usuario' : 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-circle" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
