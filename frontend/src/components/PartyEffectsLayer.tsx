import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GuestContext, PartyEffect, PartyEffectType, ProfilePartyEffectType } from "../types/api";
import { usePartyEffects } from "../hooks/usePartyEffects";
import {
  PARTY_FAVORITES_CHANGED_EVENT,
  loadPartyFavorites,
  type PartyFavoriteSlots,
} from "../utils/partyEffectFavorites";
import { PartyEffectsActionsProvider } from "../context/PartyEffectsContext";
import { ContextMenuPanel } from "./ContextMenuPanel";
import { PartyEffectOverlay, PartyEffectStyles } from "./PartyEffectOverlay";
import { PartyReactionEffect, isReactionEffectType } from "./PartyReactionEffect";
import { PartyProfileReactionEffect, isProfileReactionEffectType } from "./PartyProfileReactionEffect";
import { PartyTimeMenuSection } from "./PartyTimeMenuSection";
import { PartyTravelEffect, isTravelEffectType } from "./PartyTravelEffect";
import { PartyChillOverlay } from "./PartyChillBubble";
import { PartyPetEffect, isPetEffectType, isPetHeartsEffectType } from "./PartyPetEffect";
import { PartyPetHeartsEffect } from "./PartyPetHeartsEffect";
import { PartyLevelUpEffect, isLevelUpEffectType } from "./PartyLevelUpEffect";
import { getRadioLogoAnchor, isRadioLogoTarget } from "../utils/radioLogoAnchor";
import type { StageHostGroup } from "../utils/stageHosts";
import { pointerToNormalized } from "../utils/partyPointer";
import { PARTY_EFFECTS_LAYER_Z, PARTY_EFFECTS_MENU_Z } from "../utils/partyEffectsZIndex";

interface PartyEffectsLayerProps {
  active: boolean;
  canTrigger: boolean;
  shareToken?: string;
  guest?: GuestContext | null;
  favoritesScope?: string | null;
  hotkeysEnabled?: boolean;
  children?: ReactNode;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return true;
  if (target.isContentEditable) return true;
  return !!target.closest("[data-party-menu-ignore]");
}

export function PartyEffectsLayer({
  active,
  canTrigger,
  shareToken,
  guest,
  favoritesScope,
  hotkeysEnabled = true,
  children,
}: PartyEffectsLayerProps) {
  const { effects, chillBubbles, trigger, triggerProfile, ingest } = usePartyEffects(active, shareToken);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    normX: number;
    normY: number;
    fromLogo: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ normX: 0.5, normY: 0.5 });
  const favoritesRef = useRef<PartyFavoriteSlots>([]);

  const partyActions = useMemo(
    () => ({
      canTrigger,
      trigger: (type: PartyEffectType, x: number, y: number, guestCtx?: GuestContext) => {
        void trigger(type, x, y, guestCtx);
      },
      triggerAtPointer: (
        type: PartyEffectType,
        clientX: number,
        clientY: number,
        guestCtx?: GuestContext,
      ) => {
        const { x, y } = pointerToNormalized(clientX, clientY);
        void trigger(type, x, y, guestCtx);
      },
      triggerProfileReaction: (
        type: ProfilePartyEffectType,
        clientX: number,
        clientY: number,
        target: StageHostGroup,
        guestCtx?: GuestContext,
      ) => {
        const { x, y } = pointerToNormalized(clientX, clientY);
        const authGuest =
          guestCtx?.guestSession ? guestCtx : guest?.guestSession ? guest : undefined;
        void triggerProfile(
          type,
          x,
          y,
          {
            userId: target.userId,
            avatarVariant: target.guestAvatarVariant,
            coverIcon: target.guestCoverIcon,
          },
          authGuest,
        );
      },
      ingestEffects: (incoming: PartyEffect[]) => {
        ingest(incoming);
      },
    }),
    [canTrigger, trigger, triggerProfile, ingest, guest],
  );

  useEffect(() => {
    if (!favoritesScope) {
      favoritesRef.current = [];
      return;
    }
    const sync = () => {
      favoritesRef.current = loadPartyFavorites(favoritesScope);
    };
    sync();
    window.addEventListener(PARTY_FAVORITES_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PARTY_FAVORITES_CHANGED_EVENT, sync);
  }, [favoritesScope]);

  useEffect(() => {
    if (!canTrigger || !active) return;

    const onMouseMove = (event: MouseEvent) => {
      mouseRef.current = {
        normX: event.clientX / window.innerWidth,
        normY: event.clientY / window.innerHeight,
      };
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [canTrigger, active]);

  useEffect(() => {
    if (!canTrigger || !active || !hotkeysEnabled || !favoritesScope) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1 || event.key < "1" || event.key > "8") return;

      const slot = Number(event.key) - 1;
      const type = favoritesRef.current[slot];
      if (!type) return;

      event.preventDefault();
      const guestCtx = guest?.guestSession ? guest : undefined;
      void trigger(type, mouseRef.current.normX, mouseRef.current.normY, guestCtx);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, canTrigger, favoritesScope, guest, hotkeysEnabled, trigger]);

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!canTrigger || !active) return;

    const onContextMenu = (event: MouseEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest("[data-profile-party-root]")) {
        return;
      }
      event.preventDefault();
      setMenu({
        x: event.clientX,
        y: event.clientY,
        normX: event.clientX / window.innerWidth,
        normY: event.clientY / window.innerHeight,
        fromLogo: isRadioLogoTarget(event.target),
      });
    };

    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [canTrigger, active]);

  const runAction = (type: PartyEffectType) => {
    if (!menu) return;
    const guestCtx = guest?.guestSession ? guest : undefined;
    if (type === "react_pet") {
      const anchor = getRadioLogoAnchor();
      if (anchor) void trigger("react_pet", anchor.normX, anchor.normY, guestCtx);
    } else {
      void trigger(type, menu.normX, menu.normY, guestCtx);
    }
    closeMenu();
  };

  const spotEffects = effects.filter(
    (e) =>
      !isTravelEffectType(e.type) &&
      !isReactionEffectType(e.type) &&
      !isProfileReactionEffectType(e.type) &&
      !isPetEffectType(e.type) &&
      !isPetHeartsEffectType(e.type) &&
      !isLevelUpEffectType(e.type),
  );
  const travelEffects = effects.filter((e) => isTravelEffectType(e.type));
  const reactionEffects = effects.filter((e) => isReactionEffectType(e.type));
  const profileReactionEffects = effects.filter((e) => isProfileReactionEffectType(e.type));
  const petEffects = effects.filter((e) => isPetEffectType(e.type));
  const petHeartEffects = effects.filter((e) => isPetHeartsEffectType(e.type));
  const levelUpEffects = effects.filter((e) => isLevelUpEffectType(e.type));
  const showEffectLayer = active;

  const effectOverlay = showEffectLayer ? (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: PARTY_EFFECTS_LAYER_Z }}
      aria-hidden
    >
      <PartyEffectStyles />
      <PartyEffectOverlay effects={spotEffects} />
      {travelEffects.map((effect) => (
        <PartyTravelEffect key={effect.id} effect={effect} />
      ))}
      {reactionEffects.map((effect) => (
        <PartyReactionEffect key={effect.id} effect={effect} shareToken={shareToken} />
      ))}
      {profileReactionEffects.map((effect) => (
        <PartyProfileReactionEffect key={effect.id} effect={effect} shareToken={shareToken} />
      ))}
      {petEffects.map((effect) => (
        <PartyPetEffect key={effect.id} effect={effect} />
      ))}
      {petHeartEffects.map((effect) => (
        <PartyPetHeartsEffect key={effect.id} effect={effect} />
      ))}
      {levelUpEffects.map((effect) => (
        <PartyLevelUpEffect key={effect.id} effect={effect} />
      ))}
      <PartyChillOverlay bubbles={chillBubbles} />
    </div>
  ) : null;

  return (
    <PartyEffectsActionsProvider value={partyActions}>
      {children}
      {effectOverlay &&
        (typeof document !== "undefined"
          ? createPortal(effectOverlay, document.body)
          : effectOverlay)}
      {menu && canTrigger && (
        <ContextMenuPanel
          anchor={{ x: menu.x, y: menu.y }}
          onClose={closeMenu}
          zIndex={PARTY_EFFECTS_MENU_Z}
        >
          <div ref={menuRef}>
            <PartyTimeMenuSection onPick={runAction} showPetReaction={menu.fromLogo} />
          </div>
        </ContextMenuPanel>
      )}
    </PartyEffectsActionsProvider>
  );
}
