import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAppNavigation } from "../context/AppNavigationContext";
import { useBrandingFeatures } from "../context/BrandingFeaturesContext";
import { PinnedMediaControlProvider } from "../context/PinnedMediaControlContext";
import { useRadioPlayerContext } from "../context/RadioPlayerContext";
import { WebBroadcastProvider, useWebBroadcast } from "../context/WebBroadcastContext";
import { useHostMembers } from "../hooks/useHostMembers";
import { useResponsiveAppView } from "../hooks/useResponsiveAppView";
import { useChatUnread } from "../hooks/useChatUnread";
import { useChatTyping } from "../hooks/useChatTyping";
import { GuestStudioPage } from "../pages/GuestStudioPage";
import type { GuestContext } from "../types/api";
import { getGuestIdentity, mergeGuestProfileFromServer, type GuestIdentity } from "../utils/guestIdentity";
import { AboutModal } from "./AboutModal";
import { BroadcastSourceModal } from "./BroadcastSourceModal";
import { SearchModal } from "./SearchModal";
import { ChatFab, ChatPanel, MobileNav } from "./ChatPanel";
import { ChatMessagePingLayer } from "./ChatMessagePing";
import { ProfileFab } from "./ProfileFab";
import { RadioPanel } from "./RadioPanel";
import { ShareLinkErrorPage } from "./ShareLinkErrorPage";
import { StageDock, StageGrid } from "./StageDock";
import { PartyEffectsLayer } from "./PartyEffectsLayer";
import { SitePresenceTracker } from "./SitePresenceTracker";
import { partyFavoritesScopeForGuest, seedPartyFavoritesIfEmpty } from "../utils/partyEffectFavorites";
import { canTriggerPartyEffects } from "../utils/stagePermissions";
import { subscribeLiveEvent } from "../utils/liveEvents";

interface GuestAppProps {
  shareToken: string;
}

const LINK_CHECK_MS = 30_000;

interface GuestAppContentProps {
  shareToken: string;
  guestBroadcaster: boolean;
  guest: GuestContext;
  onGuestChange: (guest: GuestContext) => void;
  handleShareLinkInvalid: () => void;
  onStudioPage: boolean;
}

function GuestAppContent({
  shareToken,
  guestBroadcaster,
  guest,
  onGuestChange,
  handleShareLinkInvalid,
  onStudioPage,
}: GuestAppContentProps) {
  const { isLive } = useWebBroadcast();
  const player = useRadioPlayerContext();
  const { hosts: stageHosts, loading: stageLoading } = useHostMembers(true, shareToken);
  const { view, setView, chatOpen, setChatOpen } = useResponsiveAppView();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { songSearch: songSearchEnabled } = useBrandingFeatures();

  const studioPath = `/listen/${encodeURIComponent(shareToken)}/studio`;
  const showRadio = view === "radio";
  const showStage = view === "stage";
  const showChat = view === "chat";
  const showStudio = view === "studio";
  const stageGuest = guestBroadcaster ? guest : null;

  const partyCanTrigger = canTriggerPartyEffects({ authenticated: false }, guest);
  const favoritesScope = partyFavoritesScopeForGuest(shareToken, guest.guestId);
  const chatVisible = chatOpen || showChat;
  const selfUserId = guest.guestId ? `guest:${guest.guestId}` : null;
  const { unreadCount: chatUnreadCount } = useChatUnread({
    enabled: !!guest.guestSession,
    shareToken,
    guest,
    chatVisible,
  });
  const { typers: chatTypers } = useChatTyping({
    canChat: !!guest.guestSession,
    shareToken,
    selfUserId,
  });
  const othersTyping = chatTypers.length > 0 && !chatVisible;

  if (onStudioPage) {
    return (
      <PartyEffectsLayer
        active
        canTrigger={partyCanTrigger}
        shareToken={shareToken}
        guest={guest}
        favoritesScope={favoritesScope}
      >
        <SitePresenceTracker
          listening={player.playing}
          guest={guest}
          guestName={guest.guestName}
          avatarVariant={guest.avatarVariant}
          coverIcon={guest.coverIcon}
        />
        <ChatMessagePingLayer
          active={!!guest.guestSession}
          shareToken={shareToken}
          selfUserId={selfUserId}
          chatVisible={false}
        />
        <GuestStudioPage
          shareToken={shareToken}
          guest={guest}
          guestBroadcaster={guestBroadcaster}
          onGuestChange={onGuestChange}
        />
      </PartyEffectsLayer>
    );
  }

  return (
    <PartyEffectsLayer
      active
      canTrigger={partyCanTrigger}
      shareToken={shareToken}
      guest={guest}
      favoritesScope={favoritesScope}
      hotkeysEnabled={!showStudio}
    >
    <SitePresenceTracker
      listening={player.playing}
      guest={guest}
      guestName={guest.guestName}
      avatarVariant={guest.avatarVariant}
      coverIcon={guest.coverIcon}
    />
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-start justify-center p-0 pt-6 pb-16 px-3 sm:items-center sm:justify-center sm:p-4 sm:pb-4">
      <StageDock
        hosts={stageHosts}
        loading={stageLoading}
        needsAuth={false}
        visible={showRadio}
        broadcasterUserId={player.broadcasterUserId}
        streamActive={player.streamActive}
        auth={{ authenticated: false }}
        guest={stageGuest}
        partyGuest={guest}
        shareToken={shareToken}
      />

      <div className="w-full sm:max-w-2xl px-3">
        {showStage && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30">
            <StageGrid
              hosts={stageHosts}
              loading={stageLoading}
              needsAuth={false}
              broadcasterUserId={player.broadcasterUserId}
              streamActive={player.streamActive}
              auth={{ authenticated: false }}
              guest={stageGuest}
              partyGuest={guest}
              shareToken={shareToken}
            />
          </div>
        )}

        {showChat && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30">
            <ChatPanel
              guest={guest}
              auth={{ authenticated: false }}
              open
              embedded
              onClose={() => setView("radio")}
              onShareLinkInvalid={handleShareLinkInvalid}
              broadcasterUserId={player.broadcasterUserId}
            />
          </div>
        )}

        {showStudio && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30 overflow-y-auto">
            <GuestStudioPage
              shareToken={shareToken}
              guest={guest}
              guestBroadcaster={guestBroadcaster}
              embedded
              onGuestChange={onGuestChange}
            />
          </div>
        )}

        {showRadio && (
          <div className="bg-transparent sm:bg-gradient-to-br sm:from-gray-800 sm:to-gray-900 sm:rounded-2xl sm:shadow-2xl p-0 sm:p-8 sm:border sm:border-gray-700 relative overflow-visible">
            <RadioPanel
              player={player}
              onOpenAbout={() => setAboutOpen(true)}
              onOpenBroadcast={guestBroadcaster ? () => setBroadcastOpen(true) : undefined}
              showBroadcastButton={guestBroadcaster}
              broadcastLive={isLive}
              onOpenSearch={() => setSearchOpen(true)}
              guest={guest}
            />
          </div>
        )}
      </div>

      <ChatFab
        visible={!chatOpen && view === "radio"}
        unreadCount={chatUnreadCount}
        othersTyping={othersTyping}
        onClick={() => setChatOpen(true)}
      />
      <ProfileFab visible={showRadio} to={studioPath} title="Guest studio & profile" />
      <ChatPanel
        guest={guest}
        auth={{ authenticated: false }}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onShareLinkInvalid={handleShareLinkInvalid}
        broadcasterUserId={player.broadcasterUserId}
      />
      <MobileNav
        view={view}
        onChange={setView}
        showStudio
        chatUnreadCount={chatUnreadCount}
        othersTyping={othersTyping}
      />
      <ChatMessagePingLayer
        active={!!guest.guestSession}
        shareToken={shareToken}
        selfUserId={selfUserId}
        chatVisible={chatVisible}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <BroadcastSourceModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        publicExtensionDownload
        isLive={isLive}
      />
      {songSearchEnabled && (
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} guest={guest} />
      )}
    </div>
    </PartyEffectsLayer>
  );
}

export function GuestApp({ shareToken }: GuestAppProps) {
  const { path } = useAppNavigation();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [guestBroadcaster, setGuestBroadcaster] = useState(false);
  const [guest, setGuest] = useState<GuestContext>(() => {
    const identity = getGuestIdentity(shareToken);
    return { ...identity, shareToken, guestSession: "" };
  });

  const studioPath = `/listen/${encodeURIComponent(shareToken)}/studio`;
  const onStudioPage = path === studioPath;

  const refreshGuestSession = async (
    identity: GuestIdentity = getGuestIdentity(shareToken),
    options: { preferLocalIdentity?: boolean } = {},
  ) => {
    const info = await api.listenInfo(shareToken, identity.guestId);
    if (info.linkKind === "stream") {
      setLinkError("This link is for direct stream access (OBS/VLC). Use a guest view link instead.");
      return;
    }

    let mergedIdentity = identity;
    if (!options.preferLocalIdentity && info.guestProfile) {
      mergedIdentity = mergeGuestProfileFromServer(shareToken, info.guestProfile);
    }

    const nextGuest: GuestContext = {
      ...mergedIdentity,
      shareToken,
      guestSession: info.guestSession || "",
    };
    setGuestBroadcaster(info.guestMode === "guest_broadcaster");
    setGuest(nextGuest);
    const scope = partyFavoritesScopeForGuest(shareToken, nextGuest.guestId);
    if (scope) seedPartyFavoritesIfEmpty(scope);
  };

  useEffect(() => {
    void refreshGuestSession().catch(() =>
      setLinkError("This link is no longer valid. It may have been revoked or expired."),
    );
    const id = window.setInterval(() => {
      void refreshGuestSession().catch(() =>
        setLinkError("This link is no longer valid. It may have been revoked or expired."),
      );
    }, LINK_CHECK_MS);
    const onProfileUpdated = () => {
      const identity = getGuestIdentity(shareToken);
      setGuest((prev) => ({
        ...prev,
        ...identity,
      }));
    };
    const unsubscribeProfile = subscribeLiveEvent(
      "profile_changed",
      (event) => {
        try {
          const data = JSON.parse(event.data) as {
            userId?: string;
            profile?: { displayName?: string | null; avatarVariant?: number | null; coverIcon?: number | null };
          };
          if (data.userId !== `guest:${guest.guestId}` || !data.profile) return;
          const identity = mergeGuestProfileFromServer(shareToken, data.profile);
          setGuest((prev) => ({
            ...prev,
            ...identity,
          }));
        } catch {
          /* keep local profile state */
        }
      },
      { shareToken },
    );
    window.addEventListener("radio-profile-updated", onProfileUpdated);
    return () => {
      window.clearInterval(id);
      unsubscribeProfile();
      window.removeEventListener("radio-profile-updated", onProfileUpdated);
    };
  }, [shareToken, guest.guestId]);

  const broadcastAuth = useMemo(() => {
    if (!guestBroadcaster || !guest.guestSession) return null;
    return {
      mode: "guest" as const,
      displayName: guest.guestName,
      shareToken,
      guestId: guest.guestId,
      guestSession: guest.guestSession,
    };
  }, [guestBroadcaster, guest, shareToken]);

  const handleGuestChange = (next: GuestContext) => {
    void refreshGuestSession(
      {
        guestId: next.guestId,
        originalGuestId: next.originalGuestId,
        guestName: next.guestName,
        avatarVariant: next.avatarVariant,
        coverIcon: next.coverIcon,
      },
      { preferLocalIdentity: true },
    ).catch(() =>
      setLinkError("This link is no longer valid. It may have been revoked or expired."),
    );
  };

  const handleShareLinkInvalid = () => {
    setLinkError("This link is no longer valid. It may have been revoked or expired.");
  };

  if (linkError) {
    return <ShareLinkErrorPage message={linkError} />;
  }

  return (
    <WebBroadcastProvider auth={broadcastAuth}>
      <PinnedMediaControlProvider guest={guestBroadcaster ? guest : null}>
        <GuestAppContent
          shareToken={shareToken}
          guestBroadcaster={guestBroadcaster}
          guest={guest}
          onGuestChange={handleGuestChange}
          handleShareLinkInvalid={handleShareLinkInvalid}
          onStudioPage={onStudioPage}
        />
      </PinnedMediaControlProvider>
    </WebBroadcastProvider>
  );
}
