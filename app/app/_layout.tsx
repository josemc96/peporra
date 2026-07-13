import { useFonts } from 'expo-font';
import { Redirect, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, ActivityIndicator } from 'react-native-paper';
import { QueryClientProvider } from '@tanstack/react-query';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { queryClient } from '@/config/queryClient';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const inTabs = segments[0] === '(tabs)';

  if (!user && inTabs) return <Redirect href="/login" />;
  if (user && !inTabs && (segments[0] === 'login' || segments[0] === 'register')) {
    return <Redirect href="/(tabs)" />;
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PaperProvider theme={theme}>
            <AuthGuard>
              <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ headerShown: false }} />
              <Stack.Screen name="register" options={{ headerShown: false }} />
              <Stack.Screen name="groups/[id]" options={{ title: 'Peña' }} />
              <Stack.Screen name="groups/create" options={{ presentation: 'modal', title: 'Nueva peña' }} />
              <Stack.Screen name="groups/join" options={{ presentation: 'modal', title: 'Unirse a peña' }} />
              <Stack.Screen name="predictions/[season]" options={{ title: 'Predicciones' }} />
              <Stack.Screen name="predictions/edit/[matchId]" options={{ presentation: 'modal', title: 'Tu predicción' }} />
              <Stack.Screen name="ranking/[groupId]" options={{ title: 'Ranking' }} />
              <Stack.Screen name="standings-prediction/[season]" options={{ title: 'Clasificación' }} />
            </Stack>
            </AuthGuard>
          </PaperProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
