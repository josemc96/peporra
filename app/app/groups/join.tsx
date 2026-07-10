import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { groupsApi } from '@/api/groups';
import { ApiError } from '@/api/client';

export default function JoinGroupScreen() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => groupsApi.join(code.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.back();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Código no válido');
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text variant="titleLarge" style={styles.title}>Unirse a una peña</Text>
        <Text variant="bodyMedium" style={styles.hint}>
          Pide el código de 8 caracteres al admin de la peña
        </Text>

        <TextInput
          label="Código de invitación"
          value={code}
          onChangeText={(v) => { setCode(v); setError(''); }}
          autoCapitalize="none"
          autoFocus
          maxLength={8}
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
            disabled={mutation.isPending || code.trim().length === 0}
            style={styles.button}
          >
            Unirse
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
    marginBottom: 4,
  },
  hint: {
    opacity: 0.6,
    marginBottom: 4,
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
