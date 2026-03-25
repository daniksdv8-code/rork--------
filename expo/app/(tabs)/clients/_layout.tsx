import { Stack, useRouter } from "expo-router";
import React from "react";
import { TouchableOpacity } from "react-native";
import { UserPlus } from "lucide-react-native";
import Colors from "@/constants/colors";

export default function ClientsLayout() {
  const router = useRouter();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" as const },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Клиенты",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/add-client-modal' as any)}
              style={{ marginRight: 4, padding: 6 }}
              activeOpacity={0.7}
            >
              <UserPlus size={22} color={Colors.white} />
            </TouchableOpacity>
          ),
        }}
      />
    </Stack>
  );
}
