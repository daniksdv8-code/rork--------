import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";

export default function DashboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" as const },
      }}
    >
      <Stack.Screen name="index" options={{ title: "ПаркМенеджер" }} />
      <Stack.Screen name="parked-now" options={{ title: "На парковке" }} />
      <Stack.Screen name="cash-today" options={{ title: "Наличные сегодня" }} />
      <Stack.Screen name="card-today" options={{ title: "Безнал сегодня" }} />
      <Stack.Screen name="debtors-list" options={{ title: "Должники" }} />
      <Stack.Screen name="debts-list" options={{ title: "Все долги" }} />
      <Stack.Screen name="debt-payments" options={{ title: "Оплаты долгов" }} />
      <Stack.Screen name="violations" options={{ title: "Нарушения команды" }} />
    </Stack>
  );
}
