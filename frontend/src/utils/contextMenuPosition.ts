export interface MenuAnchorPoint {
  x: number;
  y: number;
}

export interface MenuAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type MenuAnchor = MenuAnchorPoint | MenuAnchorRect;

const VIEWPORT_PADDING = 12;
export const DEFAULT_MENU_WIDTH = 240;
export const DEFAULT_MENU_HEIGHT = 360;

/** Fixed width for profile preview popups (stage + chat). */
export const PROFILE_PREVIEW_MENU_WIDTH = 320;
export const PROFILE_PREVIEW_MENU_HEIGHT = 280;

function isRect(anchor: MenuAnchor): anchor is MenuAnchorRect {
  return "width" in anchor && "height" in anchor;
}

function horizontalPlacement(
  anchor: MenuAnchor,
  menuWidth: number,
  vw: number,
  pad: number,
): { left: number; width: number } {
  const gap = isRect(anchor) ? 12 : 4;
  const width = Math.min(menuWidth, Math.max(0, vw - pad * 2));

  const anchorLeft = isRect(anchor) ? anchor.left : anchor.x;
  const anchorRight = isRect(anchor) ? anchor.right : anchor.x;

  const rightCandidate = anchorRight + gap;
  const leftCandidate = anchorLeft - width - gap;

  const spaceIfRight = vw - pad - rightCandidate;
  const spaceIfLeft = leftCandidate - pad;

  const fitsRight = spaceIfRight >= width;
  const fitsLeft = spaceIfLeft >= 0;

  let left: number;
  if (fitsRight && fitsLeft) {
    const preferRight = isRect(anchor)
      ? anchor.right + width + pad * 2 < vw || anchor.left > vw / 2
      : anchor.x < vw / 2;
    left = preferRight ? rightCandidate : leftCandidate;
  } else if (fitsRight) {
    left = rightCandidate;
  } else if (fitsLeft) {
    left = leftCandidate;
  } else {
    left = Math.max(pad, Math.min(rightCandidate, vw - width - pad));
  }

  if (left + width + pad > vw) {
    left = vw - width - pad;
  }
  if (left < pad) {
    left = pad;
  }

  return { left, width };
}

export function computeContextMenuStyle(
  anchor: MenuAnchor,
  menuWidth = DEFAULT_MENU_WIDTH,
  menuHeight = DEFAULT_MENU_HEIGHT,
): { left: number; top: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = VIEWPORT_PADDING;

  const { left, width } = horizontalPlacement(anchor, menuWidth, vw, pad);

  const anchorY = isRect(anchor) ? anchor.top + anchor.height / 2 : anchor.y;
  let top = isRect(anchor) ? anchorY - menuHeight / 2 : anchorY;
  if (top + menuHeight + pad > vh) {
    top = vh - menuHeight - pad;
  }
  if (top < pad) {
    top = pad;
  }

  return { left, top, width };
}
