import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useColorScheme, View, type TextInputProps } from "react-native";
import { dark, light, type Palette } from "./theme";
import { useFoldable } from "./useFoldable";

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export function FoldSplit({
  primary,
  secondary,
  compact = "secondary-first",
}: {
  primary: ReactNode;
  secondary: ReactNode;
  compact?: "secondary-first" | "primary-first";
}) {
  const fold = useFoldable();
  const palette = usePalette();
  const pad = { padding: 20, paddingBottom: fold.twoPane ? 28 : fold.bottomChrome + 12, gap: 14 };
  if (!fold.twoPane) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: palette.bg }} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
        {compact === "secondary-first" ? secondary : primary}
        {compact === "secondary-first" ? primary : secondary}
      </ScrollView>
    );
  }
  const vertical = fold.hingeAxis !== "horizontal";
  const gutter = Math.max(fold.hinge, 16);
  return (
    <View style={{ flex: 1, flexDirection: vertical ? "row" : "column", backgroundColor: palette.bg }}>
      <ScrollView style={styles.pane} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
        {primary}
      </ScrollView>
      <View
        style={
          vertical
            ? { width: gutter, backgroundColor: fold.hinge ? palette.hinge : "transparent" }
            : { height: gutter, backgroundColor: fold.hinge ? palette.hinge : "transparent" }
        }
      />
      <ScrollView style={styles.pane} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
        {secondary}
      </ScrollView>
    </View>
  );
}

export function Stack({ children }: { children: ReactNode }) {
  return <View style={{ gap: 14 }}>{children}</View>;
}

export function Pane({ children }: { children: ReactNode }) {
  const fold = useFoldable();
  const palette = usePalette();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: fold.twoPane ? 28 : fold.bottomChrome + 12, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children }: { children: string }) {
  const palette = usePalette();
  return <Text style={[styles.eyebrow, { color: palette.brand }]}>{children}</Text>;
}

export function Title({ children }: { children: string }) {
  const palette = usePalette();
  return <Text style={[styles.title, { color: palette.text }]}>{children}</Text>;
}

export function Body({ children }: { children: string }) {
  const palette = usePalette();
  return <Text style={[styles.body, { color: palette.muted }]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>{children}</View>;
}

export function Field(props: TextInputProps) {
  const palette = usePalette();
  return (
    <TextInput
      placeholderTextColor={palette.muted}
      {...props}
      style={[styles.field, { color: palette.text, backgroundColor: palette.input, borderColor: palette.border }, props.style]}
    />
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { backgroundColor: pressed ? palette.brandPressed : palette.brand, opacity: disabled ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.primaryText, { color: palette.onBrand }]}>{label}</Text>
    </Pressable>
  );
}

export function QuietButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const palette = usePalette();
  return (
    <Pressable onPress={onPress} style={[styles.quiet, { borderColor: palette.border }]}>
      <Text style={{ color: danger ? palette.danger : palette.text, fontWeight: "600", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Monogram({ label, online }: { label: string; online?: boolean }) {
  const palette = usePalette();
  const letter = (label.trim()[0] || "K").toUpperCase();
  return (
    <View style={[styles.mark, { backgroundColor: palette.soft }]}>
      <Text style={[styles.markText, { color: palette.brand }]}>{letter}</Text>
      {online == null ? null : (
        <View style={[styles.presence, { backgroundColor: online ? palette.success : palette.muted, borderColor: palette.surface }]} />
      )}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  online,
  selected,
  trailing,
  onPress,
  onLongPress,
}: {
  title: string;
  subtitle: string;
  online?: boolean;
  selected?: boolean;
  trailing?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? palette.soft : palette.surface,
          borderColor: selected ? palette.brand : palette.border,
        },
      ]}
    >
      <Monogram label={title} online={online} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.rowSub, { color: palette.muted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {trailing ? <Text style={{ color: palette.brand, fontWeight: "700", fontSize: 12 }}>{trailing}</Text> : null}
    </Pressable>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const palette = usePalette();
  const fold = useFoldable();
  return (
    <Pressable style={[styles.scrim, { backgroundColor: palette.scrim }]} onPress={onClose}>
      <Pressable
        onPress={(event) => event.stopPropagation()}
        style={[styles.sheet, { backgroundColor: palette.surface, marginBottom: fold.rail ? 16 : fold.bottomChrome }]}
      >
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        {children}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, minWidth: 0, minHeight: 0 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.6 },
  body: { fontSize: 15, lineHeight: 22 },
  card: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 12 },
  field: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  primary: { borderRadius: 14, alignItems: "center", paddingVertical: 14 },
  primaryText: { fontSize: 16, fontWeight: "700" },
  quiet: { borderWidth: 1, borderRadius: 14, alignItems: "center", paddingVertical: 12 },
  mark: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  markText: { fontSize: 18, fontWeight: "700" },
  presence: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  row: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: "700" },
  rowSub: { marginTop: 2, fontSize: 13 },
  scrim: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", padding: 12 },
  sheet: { borderRadius: 24, padding: 18, gap: 8 },
});
