import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { useAuth } from '@/context/AuthContext';

export default function ProfileScreen() {
  const { user, isLoading } = useAuth();

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium">Perfil</Text>
      {isLoading && <Text>Cargando sesión…</Text>}
      {!isLoading && !user && <Text>No has iniciado sesión todavía (llega en la siguiente fase).</Text>}
      {user && (
        <>
          <Text>Alias: {user.alias}</Text>
          <Text>Email: {user.email}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 8,
  },
});
