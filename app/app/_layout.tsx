import { useFonts } from 'expo-font';
import { Redirect, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { QueryClientProvider } from '@tanstack/react-query';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PeporraTheme, colors } from '@/config/theme';
import { CurrentGroupProvider } from '@/context/CurrentGroupContext';
import { queryClient } from '@/config/queryClient';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

// Module-level constants — same reference on every render
const ROOT_VIEW_STYLE = { flex: 1, backgroundColor: colors.bg } as const;
const LOADING_STYLE = { flex: 1, justifyContent: 'center', alignItems: 'center' } as const;

const STACK_SCREEN_OPTIONS = {
  contentStyle: { backgroundColor: colors.bg },
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text1,
  headerShadowVisible: false,
} as const;

const OPT_HEADER_HIDDEN  = { headerShown: false } as const;
const OPT_PENA           = { title: 'Peña' } as const;
const OPT_CREATE         = { presentation: 'modal', title: 'Nueva peña' } as const;
const OPT_JOIN           = { presentation: 'modal', title: 'Unirse a peña' } as const;
const OPT_PREDICTIONS    = { title: 'Predicciones' } as const;
const OPT_EDIT_PRED      = { presentation: 'modal', title: 'Tu predicción' } as const;
const OPT_VIEW_PRED      = { title: 'Predicciones del partido' } as const;
const OPT_RANKING        = { title: 'Ranking' } as const;
const OPT_STANDINGS      = { title: 'Clasificación' } as const;
const OPT_AWARDS         = { title: 'Premios' } as const;
const OPT_KNOCKOUT       = { title: 'Copa / Supercopa' } as const;
const OPT_ADMIN          = { title: 'Panel de admin' } as const;
const OPT_ADMIN_GLOBAL   = { title: 'Admin global' } as const;
const OPT_USER_PROFILE   = { title: 'Perfil' } as const;

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
      <View style={LOADING_STYLE}>
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
  return (
    <GestureHandlerRootView style={ROOT_VIEW_STYLE}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CurrentGroupProvider>
            <PaperProvider theme={PeporraTheme}>
              <AuthGuard>
                <Stack screenOptions={STACK_SCREEN_OPTIONS}>
                  <Stack.Screen name="(tabs)"                    options={OPT_HEADER_HIDDEN} />
                  <Stack.Screen name="login"                     options={OPT_HEADER_HIDDEN} />
                  <Stack.Screen name="register"                  options={OPT_HEADER_HIDDEN} />
                  <Stack.Screen name="groups/[id]"               options={OPT_PENA} />
                  <Stack.Screen name="groups/create"             options={OPT_CREATE} />
                  <Stack.Screen name="groups/join"               options={OPT_JOIN} />
                  <Stack.Screen name="predictions/[season]"      options={OPT_PREDICTIONS} />
                  <Stack.Screen name="predictions/edit/[matchId]" options={OPT_EDIT_PRED} />
                  <Stack.Screen name="predictions/view/[matchId]" options={OPT_VIEW_PRED} />
                  <Stack.Screen name="ranking/[groupId]"         options={OPT_RANKING} />
                  <Stack.Screen name="standings-prediction/[season]" options={OPT_STANDINGS} />
                  <Stack.Screen name="award-prediction/[season]" options={OPT_AWARDS} />
                  <Stack.Screen name="knockout/[season]"         options={OPT_KNOCKOUT} />
                  <Stack.Screen name="admin/[groupId]"           options={OPT_ADMIN} />
                  <Stack.Screen name="admin/global"              options={OPT_ADMIN_GLOBAL} />
                  <Stack.Screen name="user/[userId]"             options={OPT_USER_PROFILE} />
                </Stack>
              </AuthGuard>
            </PaperProvider>
          </CurrentGroupProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
