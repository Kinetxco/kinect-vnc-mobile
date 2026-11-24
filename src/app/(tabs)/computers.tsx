import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { accountHeadline, accountView } from "../../protocol/accountView";
import { formatLastSeen } from "../../protocol/names";
import { armLaunch } from "../../session/launch";
import { listRelayDevices, type RelayDevice } from "../../session/relayClient";
import { openTcp } from "../../session/tcp";
import { currentJwt } from "../../storage/account";
import { Body, Card, Eyebrow, FoldSplit, Pane, PrimaryButton, Row, Stack, Title, usePalette } from "../../ui/components";
import { useFoldable } from "../../ui/useFoldable";

export default function ComputersScreen() {
  const palette = usePalette();
  const fold = useFoldable();
  const [headline, setHeadline] = useState("Checking sign-in…");
  const [signedIn, setSignedIn] = useState(false);
  const [devices, setDevices] = useState<RelayDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    let stop = false;
    setLoading(true);
    void (async () => {
      const account = await currentJwt();
      if (stop) return;
      const view = accountView(
        account ? { paired: true, revoked: false, accountEmail: account.email } : { paired: false, revoked: false }
      );
      setSignedIn(view.kind === "signed-in");
      setHeadline(accountHeadline(view));
      if (!account) {
        setDevices([]);
        setError(null);
        setLoading(false);
        return;
      }
      try {
        const listed = await listRelayDevices(openTcp, account.userJwt);
        if (stop) return;
        const visible = listed.filter((device) => device.deviceId && !device.revoked);
        setDevices(visible);
        setSelectedId((current) => current ?? visible[0]?.deviceId ?? null);
        setError(null);
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Could not load computers.");
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  useFocusEffect(refresh);

  const selected = devices.find((device) => device.deviceId === selectedId) ?? null;

  function connect(device: RelayDevice) {
    armLaunch({ kind: "relay", deviceId: device.deviceId, name: device.name });
    router.push("/session");
  }

  const list = (
    <Stack>
      <Eyebrow>Account</Eyebrow>
      <Title>Computers</Title>
      <Body>{headline}</Body>
      {!signedIn ? <PrimaryButton label="Sign in" onPress={() => router.push("/settings")} /> : null}
      {loading ? <ActivityIndicator color={palette.brand} /> : null}
      {error ? <Text style={{ color: palette.danger, lineHeight: 20 }}>{error}</Text> : null}
      {signedIn && !loading && devices.length === 0 ? <Body>No computers are on this account yet.</Body> : null}
      {devices.map((device) => (
        <Row
          key={device.deviceId}
          title={device.name || "Computer"}
          subtitle={device.online ? "Online" : `Offline · ${formatLastSeen(device.lastSeen)}`}
          online={device.online}
          selected={fold.twoPane && device.deviceId === selected?.deviceId}
          onPress={() => (fold.twoPane ? setSelectedId(device.deviceId) : connect(device))}
        />
      ))}
    </Stack>
  );

  const detail = (
    <Stack>
      <Eyebrow>Selected</Eyebrow>
      {selected ? (
        <>
          <Title>{selected.name || "Computer"}</Title>
          <Card>
            <Body>{selected.online ? "This computer is online and ready." : `Last seen ${formatLastSeen(selected.lastSeen)}.`}</Body>
            <PrimaryButton label="Connect" onPress={() => connect(selected)} />
          </Card>
        </>
      ) : (
        <>
          <Title>Choose one</Title>
          <Body>Select a computer on the other side of the fold. The connect button stays off the hinge.</Body>
        </>
      )}
    </Stack>
  );

  if (!fold.twoPane) return <Pane>{list}</Pane>;
  return <FoldSplit primary={list} secondary={detail} compact="primary-first" />;
}
