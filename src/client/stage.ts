/**
 * The display renders at a fixed 1920x1080 and is scaled to fit whatever window
 * it lands in. Screensharing a window whose layout shifts with its size means
 * the shared output changes character depending on how the host happened to
 * size it; pinning the design resolution removes that variable.
 */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Position the stage explicitly instead of letting CSS center it.
 *
 * The obvious approach — a centering grid plus `transform: scale()` — is
 * broken for any viewport smaller than the stage, which is most of them once
 * browser chrome or Windows display scaling (125%/150%) is involved. When the
 * 1920x1080 item overflows its container the browser clamps it to the start
 * edge rather than centering it, and scaling about the item's own center then
 * pushes the whole stage down and right, off the bottom of the screen.
 *
 * Anchoring at the top left with `transform-origin: 0 0` and translating by a
 * computed offset makes placement arithmetic we control, at every size.
 */
export function fitStage(stage: HTMLElement): void {
  // clientWidth/Height rather than innerWidth/Height: the latter includes the
  // scrollbar gutter, which would bias the centering.
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  if (vw === 0 || vh === 0) return;

  const scale = Math.min(vw / STAGE_WIDTH, vh / STAGE_HEIGHT);
  // Rounded so the letterbox bars are whole pixels and don't shimmer.
  const x = Math.round((vw - STAGE_WIDTH * scale) / 2);
  const y = Math.round((vh - STAGE_HEIGHT * scale) / 2);

  stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

export function autoFitStage(stage: HTMLElement): void {
  fitStage(stage);
  window.addEventListener("resize", () => fitStage(stage));
  // Catches viewport changes that don't raise a resize event — entering
  // fullscreen, and dragging the window to a monitor with different DPI.
  new ResizeObserver(() => fitStage(stage)).observe(document.documentElement);
}
