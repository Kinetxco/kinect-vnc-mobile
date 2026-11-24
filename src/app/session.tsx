import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebViewBase, { type WebViewMessageEvent } from "react-native-webview";

const WebView = WebViewBase as any;
import { bytesToBase64 } from "../protocol/bytes";
import { KEY, type DrawOp } from "../protocol/rfb";
import { peekLaunch, type LaunchRequest } from "../session/launch";
import { openRelaySession } from "../session/relayClient";
import { openTcp } from "../session/tcp";
import { VncSession } from "../session/vncSession";
import { currentJwt } from "../storage/account";
import { loadChatEnabled, savePassword, touchRecent } from "../storage/recents";
import { usePalette } from "../ui/components";
import { useFoldable } from "../ui/useFoldable";
import { CANVAS_HTML } from "../viewer/canvasHtml";

const PHASE_LABEL = {
  lookup: "Connecting to the computer",
  approval: "Waiting for host approval",
  connecting: "Connecting",
  authenticating: "Authenticating",
  starting: "Starting remote session",
} as const;

type PhaseName = keyof typeof PHASE_LABEL;

export default function SessionScreen() {
  const palette = usePalette();
  const fold = useFoldable();
  const webRef = useRef<any>(null);
  const sessionRef = useRef<VncSession | null>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<object[]>([]);
  const passwordRef = useRef<{ resolve: (value: string) => void; reject: (error: Error) => void } | null>(null);
  const [launch] = useState<LaunchRequest | null>(() => peekLaunch());
  const [phase, setPhase] = useState<PhaseName>("connecting");
  const [connected, setConnected] = useState(false);
  const [seenPicture, setSeenPicture] = useState(false);
  const [title, setTitle] = useState(launchTitle(launch));
  const [error, setError] = useState<string | null>(launch ? null : "Nothing to connect to.");
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [viewOnly, setViewOnly] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [draft, setDraft] = useState("");
  const [mods, setMods] = useState({ control: false, alt: false, super: false });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatOn, setChatOn] = useState(false);
  const [chatLines, setChatLines] = useState<Array<{ mine: boolean; text: string }>>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [remoteClipboard, setRemoteClipboard] = useState<string | null>(null);
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const draftRef = useRef("");

  function post(message: object) {
    if (!readyRef.current || !webRef.current) {
      queueRef.current.push(message);
      return;
    }
    webRef.current.postMessage(JSON.stringify(message));
  }

  function publish(op: DrawOp) {
    if (op.kind === "resize") {
      post({ type: "resize", w: op.width, h: op.height });
      return;
    }
    if (op.kind === "h264") {
      setVideoNote("This computer sent a video frame. Turn Kinect chat off and reconnect for a JPEG picture.");
      return;
    }
    if (op.kind === "copy") {
      post({ type: "copy", x: op.x, y: op.y, w: op.width, h: op.height, sx: op.srcX, sy: op.srcY });
      return;
    }
    if (op.kind === "jpeg") {
      post({
        type: "jpeg",
        x: op.x,
        y: op.y,
        w: op.width,
        h: op.height,
        b64: bytesToBase64(op.jpeg),
      });
      return;
    }
    const stride = op.width * 4;
    const band = 32;
    for (let row = 0; row < op.height; row += band) {
      const height = Math.min(band, op.height - row);
      post({
        type: "raw",
        x: op.x,
        y: op.y + row,
        w: op.width,
        h: height,
        b64: bytesToBase64(op.rgba.subarray(row * stride, (row + height) * stride)),
      });
    }
  }

  useEffect(() => {
    const request = peekLaunch();
    if (!request) return;
    const session = new VncSession();
    sessionRef.current = session;
    let passwordUsed = request.kind === "lan" ? request.password ?? "" : "";
    void (async () => {
      const chat = await loadChatEnabled();
      if (session.isClosed) return;
      setChatOn(chat);
      let stream;
      if (request.kind === "relay") {
        const account = await currentJwt();
        if (session.isClosed) return;
        if (!request.guestCode && !account) {
          throw new Error("Sign in, or add the guest code after the Device ID.");
        }
        stream = await openRelaySession(openTcp, {
          deviceId: request.deviceId,
          guestCode: request.guestCode,
          jwt: request.guestCode ? undefined : account?.userJwt,
          entitlement: account?.entitlement,
          onPhase: setPhase,
        });
      } else {
        setPhase("connecting");
        stream = await openTcp({ host: request.host, port: request.port, tls: false });
      }
      if (session.isClosed) {
        stream.close();
        return;
      }
      await session.start(stream, {
        accountSession: request.kind === "relay" && !request.guestCode,
        password: passwordUsed,
        chat,
        onPhase: (next) => {
          if (next === "connected") {
            setConnected(true);
            setSeenPicture(true);
            const entry =
              request.kind === "relay"
                ? {
                    kind: "relay" as const,
                    host: request.deviceId,
                    port: 0,
                    name: request.name,
                    lastConnectedAt: new Date().toISOString(),
                  }
                : {
                    kind: "lan" as const,
                    host: request.host,
                    port: request.port,
                    name: request.name,
                    lastConnectedAt: new Date().toISOString(),
                  };
            void touchRecent(entry);
            if (passwordUsed) void savePassword(entry, passwordUsed);
          } else setPhase(next);
        },
        onPassword: () =>
          new Promise<string>((resolve, reject) => {
            passwordRef.current = {
              resolve: (value) => {
                passwordUsed = value;
                resolve(value);
              },
              reject,
            };
            setNeedPassword(true);
          }),
        onDesktop: (info) => {
          if (info.name.trim()) setTitle(info.name.trim());
          post({ type: "resize", w: info.width, h: info.height });
        },
        onHost: (info) => {
          const name = info.computer || info.hostname;
          if (name) setTitle(name);
        },
        onDraw: (ops) => {
          for (const op of ops) publish(op);
        },
        onClipboard: (text) => setRemoteClipboard(text),
        onChat: (text, mine) => setChatLines((lines) => [...lines, { mine, text }].slice(-100)),
        onClose: (message) => {
          setConnected(false);
          if (message) setError(message);
        },
      });
    })().catch((err: unknown) => {
      if (!session.isClosed) setError(err instanceof Error ? err.message : "The connection failed.");
    });
    return () => {
      passwordRef.current?.reject(new Error("Authentication cancelled"));
      passwordRef.current = null;
      session.close();
    };
    // The launch is fixed for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function leave() {
    sessionRef.current?.close();
    router.back();
  }

  function onWebMessage(event: WebViewMessageEvent) {
    let payload: { type?: string; x?: number; y?: number; mask?: number; delta?: number };
    try {
      payload = JSON.parse(event.nativeEvent.data) as typeof payload;
    } catch {
      return;
    }
    if (payload.type === "ready") {
      readyRef.current = true;
      const queued = queueRef.current.splice(0, queueRef.current.length);
      for (const message of queued) webRef.current?.postMessage(JSON.stringify(message));
      return;
    }
    const session = sessionRef.current;
    if (!session || payload.x == null || payload.y == null) return;
    if (payload.type === "pointer") session.pointer(payload.x, payload.y, payload.mask ?? 0);
    if (payload.type === "click") {
      const mask = payload.mask ?? 1;
      session.pointer(payload.x, payload.y, mask);
      session.pointer(payload.x, payload.y, 0);
    }
    if (payload.type === "scroll") {
      const mask = (payload.delta ?? 0) >= 0 ? 8 : 16;
      session.pointer(payload.x, payload.y, mask);
      session.pointer(payload.x, payload.y, 0);
    }
  }

  function toggleMod(name: "control" | "alt" | "super", keysym: number) {
    setMods((current) => {
      const next = !current[name];
      sessionRef.current?.key(keysym, next);
      return { ...current, [name]: next };
    });
  }

  function onDraft(next: string) {
    const previous = draftRef.current;
    const session = sessionRef.current;
    if (next.startsWith(previous)) session?.text(next.slice(previous.length));
    else {
      const removed = Math.max(1, previous.length - next.length);
      for (let i = 0; i < removed; i += 1) {
        session?.key(KEY.BackSpace, true);
        session?.key(KEY.BackSpace, false);
      }
    }
    const stored = next.length > 48 ? "" : next;
    draftRef.current = stored;
    setDraft(stored);
  }

  function submitPassword() {
    const pending = passwordRef.current;
    passwordRef.current = null;
    setNeedPassword(false);
    if (launch?.kind === "lan") {
      void savePassword({ kind: "lan", host: launch.host, port: launch.port }, password);
    }
    pending?.resolve(password);
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.canvas }]}>
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: CANVAS_HTML }}
        onMessage={onWebMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={styles.web}
      />
      <SafeAreaView style={styles.overlay} edges={["top", "bottom"]} pointerEvents="box-none">
        <View style={styles.toolbar} pointerEvents="box-none">
          <View style={styles.cluster} pointerEvents="box-none">
            <BarButton label="Close" onPress={leave} />
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </View>
          {fold.hingeAxis === "vertical" ? <View style={{ width: fold.hinge }} /> : null}
          <View style={[styles.cluster, styles.clusterEnd]} pointerEvents="box-none">
            <BarButton label={viewOnly ? "View" : "Control"} onPress={() => {
              const next = !viewOnly;
              setViewOnly(next);
              sessionRef.current?.setViewOnly(next);
            }} />
            <BarButton label="Keys" onPress={() => setKeyboard((open) => !open)} />
            {chatOn ? <BarButton label="Chat" onPress={() => setChatOpen((open) => !open)} /> : null}
            <BarButton label="Fit" onPress={() => post({ type: "fit" })} />
          </View>
        </View>
        {videoNote ? <Text style={styles.note}>{videoNote}</Text> : null}
        {remoteClipboard ? (
          <Pressable
            onPress={() => {
              void Clipboard.setStringAsync(remoteClipboard);
              setRemoteClipboard(null);
            }}
            style={styles.noteButton}
          >
            <Text style={styles.note}>Copy remote clipboard to this phone</Text>
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }} pointerEvents="none" />
        {keyboard ? (
          <View
            style={[
              styles.dock,
              { backgroundColor: palette.surface },
              fold.hingeAxis === "vertical" ? { alignSelf: "flex-start", width: "46%" } : null,
            ]}
          >
            <View style={styles.keyRow}>
              <MiniKey label="Esc" onPress={() => tap(KEY.Escape)} />
              <MiniKey label="Tab" onPress={() => tap(KEY.Tab)} />
              <MiniKey label={mods.control ? "Ctrl on" : "Ctrl"} onPress={() => toggleMod("control", KEY.Control)} />
              <MiniKey label={mods.alt ? "Alt on" : "Alt"} onPress={() => toggleMod("alt", KEY.Alt)} />
              <MiniKey label={mods.super ? "Win on" : "Win"} onPress={() => toggleMod("super", KEY.Super)} />
              <MiniKey label="Del" onPress={() => tap(KEY.Delete)} />
            </View>
            <View style={styles.keyRow}>
              <MiniKey label="←" onPress={() => tap(KEY.Left)} />
              <MiniKey label="↑" onPress={() => tap(KEY.Up)} />
              <MiniKey label="↓" onPress={() => tap(KEY.Down)} />
              <MiniKey label="→" onPress={() => tap(KEY.Right)} />
              <MiniKey
                label="Paste"
                onPress={() => {
                  void Clipboard.getStringAsync().then((text) => {
                    if (text) sessionRef.current?.clipboard(text);
                  });
                }}
              />
            </View>
            <TextInput
              value={draft}
              onChangeText={onDraft}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Type to the computer"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
          </View>
        ) : null}
        {chatOpen ? (
          <View
            style={[
              styles.dock,
              { backgroundColor: palette.surface, maxHeight: 280 },
              fold.hingeAxis === "vertical" ? { alignSelf: "flex-end", width: "46%" } : null,
            ]}
          >
            {chatLines.length === 0 ? <Text style={{ color: palette.muted }}>No messages yet.</Text> : null}
            {chatLines.slice(-8).map((line, index) => (
              <Text key={`${index}-${line.text}`} style={{ color: palette.text }}>
                {line.mine ? "You: " : "Computer: "}
                {line.text}
              </Text>
            ))}
            <View style={styles.keyRow}>
              <TextInput
                value={chatDraft}
                onChangeText={setChatDraft}
                placeholder="Message"
                placeholderTextColor={palette.muted}
                style={[styles.input, { flex: 1, color: palette.text, borderColor: palette.border }]}
              />
              <BarButton
                label="Send"
                onPress={() => {
                  sessionRef.current?.sendChat(chatDraft);
                  setChatDraft("");
                }}
              />
            </View>
          </View>
        ) : null}
      </SafeAreaView>
      {!connected && !error ? (
        <View style={[styles.scrim, { backgroundColor: palette.scrim }, fold.hingeAxis === "vertical" && styles.scrimLeft]}>
          <Text style={styles.phase}>{PHASE_LABEL[phase]}</Text>
          <Pressable onPress={leave} style={[styles.fullButton, { backgroundColor: palette.brand, marginTop: 18, paddingHorizontal: 28 }]}>
            <Text style={{ color: palette.onBrand, fontWeight: "700" }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.scrim, { backgroundColor: palette.scrim }, fold.hingeAxis === "vertical" && styles.scrimLeft]}>
          <View style={[styles.dialog, { backgroundColor: palette.surface }, fold.hingeAxis === "vertical" && styles.dialogPane]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>
              {seenPicture ? "Disconnected" : "Could not connect"}
            </Text>
            <Text style={{ color: palette.muted, lineHeight: 20 }}>{error}</Text>
            <Pressable onPress={leave} style={[styles.fullButton, { backgroundColor: palette.brand }]}>
              <Text style={{ color: palette.onBrand, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {needPassword ? (
        <View style={[styles.scrim, { backgroundColor: palette.scrim }, fold.hingeAxis === "vertical" && styles.scrimLeft]}>
          <View style={[styles.dialog, { backgroundColor: palette.surface }, fold.hingeAxis === "vertical" && styles.dialogPane]}>
            <Text style={[styles.dialogTitle, { color: palette.text }]}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
              placeholder="VNC password"
              placeholderTextColor={palette.muted}
              style={[styles.input, { color: palette.text, borderColor: palette.border }]}
            />
            <Pressable onPress={submitPassword} style={[styles.fullButton, { backgroundColor: palette.brand }]}>
              <Text style={{ color: palette.onBrand, fontWeight: "700" }}>Continue</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                passwordRef.current?.reject(new Error("Authentication cancelled"));
                passwordRef.current = null;
                setNeedPassword(false);
              }}
            >
              <Text style={{ color: palette.muted, textAlign: "center" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );

  function tap(keysym: number) {
    sessionRef.current?.key(keysym, true);
    sessionRef.current?.key(keysym, false);
  }
}

function launchTitle(launch: LaunchRequest | null): string {
  if (!launch) return "Kinect VNC";
  if (launch.name) return launch.name;
  if (launch.kind === "relay") return launch.deviceId;
  return launch.port === 5900 ? launch.host : `${launch.host}:${launch.port}`;
}

function BarButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.barButton}>
      <Text style={styles.barText}>{label}</Text>
    </Pressable>
  );
}

function MiniKey({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.mini}>
      <Text style={styles.barText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  web: { ...StyleSheet.absoluteFill },
  overlay: { flex: 1 },
  toolbar: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 10, paddingTop: 4 },
  cluster: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  clusterEnd: { justifyContent: "flex-end" },
  title: { flexShrink: 1, color: "#f4f7f4", fontWeight: "700", fontSize: 16 },
  scrimLeft: { alignItems: "flex-start", justifyContent: "center", paddingLeft: 28 },
  dialogPane: { maxWidth: 420, width: "92%" },
  barButton: { backgroundColor: "rgba(18, 32, 22, 0.88)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  barText: { color: "#f4faf5", fontSize: 13, fontWeight: "600" },
  note: { color: "#f4faf5", paddingHorizontal: 12, paddingVertical: 6 },
  noteButton: { alignSelf: "flex-start" },
  dock: { margin: 10, borderRadius: 16, padding: 10, gap: 8 },
  keyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mini: { backgroundColor: "#1a3020", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  scrim: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 24 },
  phase: { color: "#f4faf5", fontSize: 18, fontWeight: "600", textAlign: "center" },
  dialog: { width: "100%", maxWidth: 420, borderRadius: 16, padding: 18, gap: 12 },
  dialogTitle: { fontSize: 20, fontWeight: "700" },
  fullButton: { borderRadius: 12, alignItems: "center", paddingVertical: 12 },
});
