import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { dark, light } from "../ui/theme";

export default function RootLayout() {
  const scheme = useColorScheme();
  const palette = scheme === "dark" ? dark : light;
  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session" options={{ animation: "fade", gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
