import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { Link, router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/api/client';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister() {
    setError('');
    setLoading(true);
    try {
      await register(email.trim(), password, alias.trim());
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text variant="displaySmall" style={styles.brand}>Peporra</Text>
        <Text variant="titleMedium" style={styles.subtitle}>Crear cuenta</Text>

        <TextInput
          label="Alias"
          value={alias}
          onChangeText={setAlias}
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={styles.input}
        />
        <TextInput
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={loading || !email || !password || !alias}
          style={styles.button}
        >
          Crear cuenta
        </Button>

        <View style={styles.footer}>
          <Text>¿Ya tienes cuenta? </Text>
          <Link href="/login" asChild>
            <Text style={styles.link}>Inicia sesión</Text>
          </Link>
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
    justifyContent: 'center',
    gap: 12,
  },
  brand: {
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 12,
    opacity: 0.7,
  },
  input: {
    width: '100%',
  },
  error: {
    color: '#9C3B2C',
  },
  button: {
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
