export type SizeClass = "compact" | "medium" | "expanded";
export type HingeAxis = "vertical" | "horizontal" | "none";

export type FoldLayout = {
  sizeClass: SizeClass;
  hinge: number;
  hingeAxis: HingeAxis;
  rail: boolean;
  twoPane: boolean;
};

/**
 * Material window-size classes, plus a center gutter when the window is large
 * enough to be an open foldable. The gutter is vertical in landscape (book
 * fold) and horizontal in portrait (top/bottom fold). A phone, including one
 * held sideways, stays a single pane.
 */
export function foldLayout(width: number, height: number): FoldLayout {
  const sizeClass: SizeClass = width < 600 ? "compact" : width < 840 ? "medium" : "expanded";
  const shortSide = Math.min(width, height);
  const aspect = width / Math.max(height, 1);
  const openFoldable = shortSide >= 600 && aspect > 0.62 && aspect < 1.55;
  const hingeAxis: HingeAxis = !openFoldable ? "none" : width >= height ? "vertical" : "horizontal";
  const hinge = openFoldable ? Math.min(48, Math.max(16, Math.round(shortSide * 0.04))) : 0;
  return {
    sizeClass,
    hinge,
    hingeAxis,
    rail: sizeClass !== "compact" && hingeAxis !== "horizontal",
    twoPane: sizeClass !== "compact",
  };
}
