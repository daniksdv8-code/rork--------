import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { ParkingProvider } from "@/providers/ParkingProvider";
import { trpc, trpcClient } from "@/lib/trpc";
import Colors from "@/constants/colors";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inLoginPage = segments[0] === 'login';

    if (!currentUser && !inLoginPage) {
      console.log('[AuthGate] Not authenticated, redirecting to login');
      router.replace('/login');
    } else if (currentUser && inLoginPage) {
      console.log('[AuthGate] Authenticated, redirecting to dashboard');
      router.replace('/(tabs)/(dashboard)');
    }
  }, [currentUser, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.primary }}>
        <ActivityIndicator size="large" color={Colors.white} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGate>
      <Stack screenOptions={{ headerBackTitle: "Назад" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="client-card" options={{ title: "Карточка клиента" }} />
        <Stack.Screen name="exit-modal" options={{ title: "Выезд", presentation: "modal" }} />
        <Stack.Screen name="pay-debt-modal" options={{ title: "Погашение долга", presentation: "modal" }} />
        <Stack.Screen name="pay-monthly-modal" options={{ title: "Оплата месяца", presentation: "modal" }} />
        <Stack.Screen name="add-client-modal" options={{ title: "Новый клиент", presentation: "modal" }} />
        <Stack.Screen name="add-violation-modal" options={{ title: "Новое нарушение", presentation: "modal" }} />
      </Stack>
    </AuthGate>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
            <ParkingProvider>
              <RootLayoutNav />
            </ParkingProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
