import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { parseConnectTarget } from "../../protocol/connectTarget";
import { armLaunch } from "../../session/launch";
import {
  loadPassword,
  loadRecents,
  recentSubtitle,
  recentTitle,
  removeRecent,
  setRecentPinned,
  type RecentConnection,
} from "../../storage/recents";
import { Body, Card, Eyebrow, Field, FoldSplit, PrimaryButton, QuietButton, Row, Sheet, Stack, Title, usePalette } from "../../ui/components";

export default function HomeScreen() {
  const palette = usePalette();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<RecentConnection | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    loadRecents()
      .then(setRecents)
      .catch(() => setRecents([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  async function connectRecent(entry: RecentConnection) {
    const password = (await loadPassword(entry)) ?? undefined;
    if (entry.kind === "relay") {
      armLaunch({ kind: "relay", deviceId: entry.host, name: recentTitle(entry) });
    } else {
      armLaunch({ kind: "lan", host: entry.host, port: entry.port, password, name: recentTitle(entry) });
    }
    router.push("/session");
  }

  function connectQuery() {
    const target = parseConnectTarget(query);
    if (!target) {
      setError("Enter an address like 192.168.1.20, or a Device ID and guest code.");
      return;
    }
    setError(null);
    if (target.kind === "lan") armLaunch({ kind: "lan", host: target.host, port: target.port });
    else armLaunch({ kind: "relay", deviceId: target.deviceId, guestCode: target.guestCode });
    router.push("/session");
  }

  const connectPane = (
    <Stack>
      <Eyebrow>Kinect VNC</Eyebrow>
      <Title>Connect</Title>
      <Body>Open a computer by local address or Device ID. Add a guest code after the ID when you are not signed in.</Body>
      <Card>
        <Field
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="192.168.1.20 or Device ID"
          onSubmitEditing={connectQuery}
          returnKeyType="go"
        />
        <PrimaryButton label="Connect" onPress={connectQuery} />
        {error ? <Text style={{ color: palette.danger, lineHeight: 20 }}>{error}</Text> : null}
      </Card>
    </Stack>
  );

  const recentPane = (
    <Stack>
      <Eyebrow>Recent</Eyebrow>
      <Title>Computers</Title>
      {loading ? <ActivityIndicator color={palette.brand} /> : null}
      {!loading && recents.length === 0 ? <Body>Computers you open show up here. Hold one to pin or remove it.</Body> : null}
      {recents.map((entry) => (
        <Row
          key={`${entry.kind}:${entry.host}:${entry.port}`}
          title={recentTitle(entry)}
          subtitle={recentSubtitle(entry)}
          trailing={entry.pinned ? "Pinned" : undefined}
          onPress={() => void connectRecent(entry)}
          onLongPress={() => setActions(entry)}
        />
      ))}
    </Stack>
  );

  return (
    <>
      <FoldSplit primary={recentPane} secondary={connectPane} />
      {actions ? (
        <Sheet title={recentTitle(actions)} onClose={() => setActions(null)}>
          <QuietButton
            label="Connect"
            onPress={() => {
              const entry = actions;
              setActions(null);
              void connectRecent(entry);
            }}
          />
          <QuietButton
            label={actions.pinned ? "Unpin" : "Pin"}
            onPress={() => {
              void setRecentPinned(actions, !actions.pinned).then(setRecents);
              setActions(null);
            }}
          />
          <QuietButton
            label="Remove"
            danger
            onPress={() => {
              void removeRecent(actions).then(setRecents);
              setActions(null);
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}
