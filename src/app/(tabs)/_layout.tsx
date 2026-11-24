import { Slot, usePathname, router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "../../ui/components";
import { useFoldable } from "../../ui/useFoldable";

const DESTINATIONS = [
  { href: "/", label: "Home" },
  { href: "/computers", label: "Computers" },
  { href: "/settings", label: "Settings" },
] as const;

export default function TabLayout() {
  const palette = usePalette();
  const fold = useFoldable();
  const pathname = usePathname();

  return (
    <View style={[styles.shell, { flexDirection: fold.rail ? "row" : "column", backgroundColor: palette.bg }]}>
      {fold.rail ? <Rail pathname={pathname} /> : null}
      <View style={styles.content}>
        <Slot />
      </View>
      {fold.rail ? null : <PhoneNav pathname={pathname} />}
    </View>
  );
}

function Rail({ pathname }: { pathname: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.rail, { backgroundColor: palette.rail, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>K</Text>
      </View>
      {DESTINATIONS.map((item) => {
        const active = pathname === item.href;
        return (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => router.push(item.href)}
            style={[styles.railItem, active && styles.railItemActive]}
          >
            <Text style={[styles.railLabel, { color: active ? "#ffffff" : palette.railMuted }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhoneNav({ pathname }: { pathname: string }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.phoneWrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={[styles.phoneBar, { backgroundColor: palette.rail }]}>
        {DESTINATIONS.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => router.push(item.href)}
              style={[styles.phoneItem, active && { backgroundColor: "rgba(255,255,255,0.14)" }]}
            >
              <Text style={{ color: active ? "#ffffff" : palette.railMuted, fontWeight: "700", fontSize: 13 }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  content: { flex: 1, minWidth: 0 },
  rail: { width: 148, paddingHorizontal: 12, gap: 6 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#36633d",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    alignSelf: "center",
  },
  logoText: { color: "#ffffff", fontSize: 20, fontWeight: "700" },
  railItem: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 },
  railItemActive: { backgroundColor: "rgba(255,255,255,0.12)" },
  railLabel: { fontSize: 14, fontWeight: "700" },
  phoneWrap: { position: "absolute", left: 16, right: 16, bottom: 0 },
  phoneBar: { borderRadius: 22, flexDirection: "row", padding: 6, gap: 4 },
  phoneItem: { flex: 1, borderRadius: 16, alignItems: "center", paddingVertical: 12 },
});
