import { Tabs } from "expo-router";
import { LayoutDashboard, LogIn, ParkingSquare, Users, Menu } from "lucide-react-native";
import React from "react";
import Colors from "@/constants/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.tabBarBorder,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="(dashboard)"
        options={{
          title: "Главная",
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="checkin"
        options={{
          title: "Заезд",
          tabBarIcon: ({ color, size }) => <LogIn size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="parking"
        options={{
          title: "Парковка",
          tabBarIcon: ({ color, size }) => <ParkingSquare size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Клиенты",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "Ещё",
          tabBarIcon: ({ color, size }) => <Menu size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
