import { StyleSheet, View } from 'react-native';
import { Avatar, Button, Divider, Text } from 'react-native-paper';
import { router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

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
          <Text variant="labelSmall" style={styles.adminBadge}>Admin</Text>
        )}
      </View>

      <Divider style={styles.divider} />

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
  logoutButton: {
    marginTop: 8,
  },
});
