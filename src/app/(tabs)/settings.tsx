import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Switch, Text, View } from "react-native";
import { APP_VERSION } from "../../build";
import { accountHeadline, accountView } from "../../protocol/accountView";
import { clearAccount, currentJwt, signInAndStore, type StoredAccount } from "../../storage/account";
import { loadChatEnabled, saveChatEnabled } from "../../storage/recents";
import {
  Body,
  Card,
  Eyebrow,
  Field,
  FoldSplit,
  Pane,
  PrimaryButton,
  QuietButton,
  Row,
  Stack,
  Title,
  usePalette,
} from "../../ui/components";
import { useFoldable } from "../../ui/useFoldable";

type Section = "account" | "chat" | "about";

export default function SettingsScreen() {
  const palette = usePalette();
  const fold = useFoldable();
  const [section, setSection] = useState<Section>("account");
  const [account, setAccount] = useState<StoredAccount | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(false);

  const refresh = useCallback(() => {
    let stop = false;
    void currentJwt().then((value) => {
      if (!stop) setAccount(value);
    });
    void loadChatEnabled().then((value) => {
      if (!stop) setChat(value);
    });
    return () => {
      stop = true;
    };
  }, []);

  useFocusEffect(refresh);

  const view = accountView(
    account === undefined ? null : account ? { paired: true, revoked: false, accountEmail: account.email } : { paired: false, revoked: false }
  );

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const next = await signInAndStore(email, password);
      setAccount(next);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  const accountCard = (
    <Card>
      <Text style={{ color: palette.text, fontSize: 17, fontWeight: "700" }}>Account</Text>
      <Body>{accountHeadline(view)}</Body>
      {view.kind === "signed-in" ? (
        <QuietButton label="Sign out" onPress={() => void clearAccount().then(() => setAccount(null))} />
      ) : (
        <>
          <Field value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email" />
          <Field value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" />
          {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
          <PrimaryButton label={busy ? "Signing in…" : "Sign in"} onPress={() => void submit()} disabled={busy} />
        </>
      )}
    </Card>
  );

  const chatCard = (
    <Card>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: palette.text, fontSize: 17, fontWeight: "700" }}>Kinect chat</Text>
          <Body>Off by default. Turning it on can switch that session to video frames this phone does not draw.</Body>
        </View>
        <Switch
          value={chat}
          onValueChange={(value) => {
            setChat(value);
            void saveChatEnabled(value);
          }}
          trackColor={{ true: palette.brand, false: palette.border }}
        />
      </View>
    </Card>
  );

  const aboutCard = (
    <Card>
      <Text style={{ color: palette.text, fontSize: 17, fontWeight: "700" }}>Kinect VNC</Text>
      <Body>{`Version ${APP_VERSION}`}</Body>
      <Body>Touch moves the pointer. A long press is a right-click. Two fingers scroll, and a pinch zooms the picture.</Body>
    </Card>
  );

  const menu = (
    <Stack>
      <Eyebrow>App</Eyebrow>
      <Title>Settings</Title>
      <Row title="Account" subtitle="Sign in and computers" selected={section === "account"} onPress={() => setSection("account")} />
      <Row title="Chat" subtitle={chat ? "On for the next connection" : "Off"} selected={section === "chat"} onPress={() => setSection("chat")} />
      <Row title="About" subtitle={`Version ${APP_VERSION}`} selected={section === "about"} onPress={() => setSection("about")} />
    </Stack>
  );

  const panel = (
    <Stack>
      <Eyebrow>{section === "account" ? "Account" : section === "chat" ? "Session" : "About"}</Eyebrow>
      <Title>{section === "account" ? "Sign in" : section === "chat" ? "Chat" : "About"}</Title>
      {section === "account" ? accountCard : section === "chat" ? chatCard : aboutCard}
    </Stack>
  );

  if (!fold.twoPane) {
    return (
      <Pane>
        <Eyebrow>App</Eyebrow>
        <Title>Settings</Title>
        {accountCard}
        {chatCard}
        {aboutCard}
      </Pane>
    );
  }

  return <FoldSplit primary={menu} secondary={panel} compact="primary-first" />;
}
