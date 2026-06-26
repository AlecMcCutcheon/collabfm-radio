export const RADIO_LOGO_SELECTOR = "[data-radio-logo]";

export function isRadioLogoTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(RADIO_LOGO_SELECTOR);
}

export interface RadioLogoAnchor {
  normX: number;
  normY: number;
}

export function getRadioLogoAnchor(): RadioLogoAnchor | null {
  const el = document.querySelector(RADIO_LOGO_SELECTOR);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    normX: (rect.left + rect.width / 2) / window.innerWidth,
    normY: (rect.top + rect.height / 2) / window.innerHeight,
  };
}

export function getRadioLogoRect(): DOMRect | null {
  const el = document.querySelector(RADIO_LOGO_SELECTOR);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}
