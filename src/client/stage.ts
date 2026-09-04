/**
 * The display renders at a fixed 1920x1080 and is scaled to fit whatever window
 * it lands in. Screensharing a window whose layout shifts with its size means
 * the shared output changes character depending on how the host happened to
 * size it; pinning the design resolution removes that variable.
 */
export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export function autoFitStage(stage: HTMLElement): void {
  const fit = () => {
    const scale = Math.min(
      window.innerWidth / STAGE_WIDTH,
      window.innerHeight / STAGE_HEIGHT,
    );
    stage.style.transform = `scale(${scale})`;
  };
  fit();
  window.addEventListener("resize", fit);
}
