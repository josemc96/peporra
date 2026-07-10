import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore no existe en web, así que en esa plataforma usamos localStorage.
// La API queda igual (async) para que el resto del código no tenga que saber la diferencia.

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const storage = { getItem, setItem, removeItem };
