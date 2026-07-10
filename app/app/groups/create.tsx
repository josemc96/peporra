import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { groupsApi } from '@/api/groups';
import { ApiError } from '@/api/client';

const DEFAULT_SEASON = '2026-2027';

export default function CreateGroupScreen() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => groupsApi.create(name.trim(), season.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Error al crear la peña');
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text variant="titleLarge" style={styles.title}>Nueva peña</Text>

        <TextInput
          label="Nombre de la peña"
          value={name}
          onChangeText={setName}
          autoFocus
          style={styles.input}
        />
        <TextInput
          label="Temporada"
          value={season}
          onChangeText={setSeason}
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={() => router.back()} style={styles.button}>
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={mutation.isPending || !name.trim()}
            style={styles.button}
          >
            Crear
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    marginBottom: 8,
  },
  input: {
    width: '100%',
  },
  error: {
    color: '#9C3B2C',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
  },
});
