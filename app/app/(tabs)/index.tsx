import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';

import { env } from '@/config/env';

type ConnectionStatus = 'loading' | 'ok' | 'error';

function healthUrl(): string {
  return `${env.apiUrl.replace(/\/api\/?$/, '')}/health`;
}

export default function GroupsScreen() {
  const [status, setStatus] = useState<ConnectionStatus>('loading');
  const [detail, setDetail] = useState('');

  async function checkHealth() {
    setStatus('loading');
    try {
      const res = await fetch(healthUrl());
      const body = await res.json();
      setDetail(JSON.stringify(body));
      setStatus(res.ok ? 'ok' : 'error');
    } catch (err) {
      setDetail(err instanceof Error ? err.message : 'Error desconocido');
      setStatus('error');
    }
  }

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={styles.title}>
        Peporra
      </Text>

      <Card style={styles.card}>
        <Card.Title title="Conexión con el backend" subtitle={healthUrl()} />
        <Card.Content>
          {status === 'loading' && <ActivityIndicator />}
          {status === 'ok' && <Text style={styles.ok}>✓ Conectado: {detail}</Text>}
          {status === 'error' && <Text style={styles.error}>✗ Sin conexión: {detail}</Text>}
        </Card.Content>
        <Card.Actions>
          <Button onPress={checkHealth}>Reintentar</Button>
        </Card.Actions>
      </Card>

      <Text style={styles.hint}>
        Esta pantalla es temporal, solo para verificar la conexión. En la siguiente fase se
        sustituye por la lista real de "Mis peñas".
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    marginTop: 12,
  },
  card: {
    width: '100%',
  },
  ok: {
    color: '#1E6B45',
  },
  error: {
    color: '#9C3B2C',
  },
  hint: {
    opacity: 0.6,
    fontSize: 13,
  },
});
