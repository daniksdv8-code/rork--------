import { Stack } from "expo-router";
import React from "react";
import Colors from "@/constants/colors";

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" as const },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Ещё" }} />
      <Stack.Screen name="debtors" options={{ title: "Должники" }} />
      <Stack.Screen name="history" options={{ title: "История" }} />
      <Stack.Screen name="reports" options={{ title: "Отчёты" }} />
      <Stack.Screen name="settings" options={{ title: "Настройки" }} />
      <Stack.Screen name="cashregister" options={{ title: "Касса" }} />
      <Stack.Screen name="schedule" options={{ title: "Календарь смен" }} />
      <Stack.Screen name="actionlog" options={{ title: "Журнал действий" }} />
      <Stack.Screen name="export" options={{ title: "Экспорт данных" }} />
      <Stack.Screen name="finance" options={{ title: "Финансы" }} />
      <Stack.Screen name="salaryadvances" options={{ title: "Зарплаты и авансы" }} />
      <Stack.Screen name="anomalylog" options={{ title: "Самодиагностика" }} />
    </Stack>
  );
}
