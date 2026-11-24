import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { foldLayout } from "./fold";

export function useFoldable() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fold = foldLayout(width, height);
  return {
    ...fold,
    width,
    height,
    insets,
    bottomChrome: fold.rail ? Math.max(insets.bottom, 16) : insets.bottom + 92,
  };
}
