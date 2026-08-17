import { View, Pressable, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentGroup } from '@/context/CurrentGroupContext';

type Tab = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  href: string;
};

function resolveActiveTab(seg0: string, seg1: string | undefined): string {
  if (seg0 === '(tabs)') return seg1 ?? 'index';
  if (seg0 === 'predictions' || seg0 === 'standings-prediction' || seg0 === 'award-prediction' || seg0 === 'knockout') return 'predictions';
  if (seg0 === 'ranking' || seg0 === 'admin') return 'group';
  if (seg0 === 'groups') return 'index';
  if (seg0 === 'user') return 'profile';
  return '';
}

export function BottomNavBar() {
  const router = useRouter();
  const segments = useSegments();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { group } = useCurrentGroup();
  const inGroup = !!group;

  const activeTab = resolveActiveTab(segments[0] ?? '', segments[1]);

  const tabs: Tab[] = inGroup
    ? [
        { key: 'group',       label: 'Peña',          icon: 'account-group',  href: '/(tabs)/group' },
        { key: 'predictions', label: 'Predicciones',   icon: 'soccer-field',   href: '/(tabs)/predictions' },
        { key: 'profile',     label: 'Usuario',        icon: 'account-circle', href: '/(tabs)/profile' },
      ]
    : [
        { key: 'index',   label: 'Peñas',  icon: 'soccer',          href: '/(tabs)' },
        { key: 'profile', label: 'Perfil', icon: 'account-circle',  href: '/(tabs)/profile' },
      ];

  return (
    <View style={[styles.container, {
      backgroundColor: theme.colors.surface,
      borderTopColor: theme.colors.outline,
      paddingBottom: Math.max(insets.bottom, 8),
    }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const color = active ? theme.colors.primary : theme.colors.onSurfaceVariant;
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => router.navigate(tab.href as never)}
          >
            <MaterialCommunityIcons name={tab.icon} size={24} color={color} />
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 11,
  },
});
