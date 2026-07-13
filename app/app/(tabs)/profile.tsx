import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, Text } from 'react-native-paper';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from 'react-native-paper';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const theme = useTheme();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  if (!user) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar.Text size={64} label={user.alias.slice(0, 2).toUpperCase()} />
        <Text variant="headlineSmall" style={styles.alias}>{user.alias}</Text>
        <Text variant="bodyMedium" style={styles.email}>{user.email}</Text>
        {user.role === 'admin' && (
          <Text variant="labelSmall" style={[styles.adminBadge, { backgroundColor: theme.colors.primaryContainer, color: theme.colors.primary }]}>
            Admin global
          </Text>
        )}
      </View>

      <Divider style={styles.divider} />

      {user.role === 'admin' && (
        <Button
          mode="contained-tonal"
          icon="shield-crown"
          style={styles.adminButton}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onPress={() => router.push('/admin/global' as any)}
        >
          Panel de admin global
        </Button>
      )}

      <Button
        mode="outlined"
        onPress={handleLogout}
        icon="logout"
        style={styles.logoutButton}
      >
        Cerrar sesión
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  alias: {
    marginTop: 8,
  },
  email: {
    opacity: 0.6,
  },
  adminBadge: {
    backgroundColor: '#E8F4FD',
    color: '#1565C0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  divider: {
    marginVertical: 16,
  },
  adminButton: {
    marginBottom: 8,
  },
  logoutButton: {
    marginTop: 8,
  },
});
