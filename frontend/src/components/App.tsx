import { useMemo, useState } from "react";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { useHostMembers } from "../hooks/useHostMembers";
import { useRadioPlayerContext } from "../context/RadioPlayerContext";
import { useBrandingFeatures } from "../context/BrandingFeaturesContext";
import { PinnedMediaControlProvider } from "../context/PinnedMediaControlContext";
import { WebBroadcastProvider, useWebBroadcast } from "../context/WebBroadcastContext";
import { useResponsiveAppView } from "../hooks/useResponsiveAppView";
import { useChatUnread } from "../hooks/useChatUnread";
import { useChatTyping } from "../hooks/useChatTyping";
import { BroadcasterPage } from "../pages/BroadcasterPage";
import { AboutModal } from "./AboutModal";
import { BroadcastSourceModal } from "./BroadcastSourceModal";
import { ProfileFab } from "./ProfileFab";
import { SearchModal } from "./SearchModal";
import { ChatFab, ChatPanel, MobileNav } from "./ChatPanel";
import { ChatMessagePingLayer } from "./ChatMessagePing";
import { RadioPanel } from "./RadioPanel";
import { StageDock, StageGrid } from "./StageDock";
import { PartyEffectsLayer } from "./PartyEffectsLayer";
import { SitePresenceTracker } from "./SitePresenceTracker";
import { canTriggerPartyEffects } from "../utils/stagePermissions";
import { partyFavoritesScopeForUser } from "../utils/partyEffectFavorites";

function AppContent() {
  const { status } = useAuthStatus();
  const { isLive } = useWebBroadcast();
  const { hosts: stageHosts, loading: stageLoading, needsAuth: stageNeedsAuth } = useHostMembers(true);
  const player = useRadioPlayerContext();
  const { view, setView, chatOpen, setChatOpen } = useResponsiveAppView();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { songSearch: songSearchEnabled } = useBrandingFeatures();

  const showRadio = view === "radio";
  const showStage = view === "stage";
  const showChat = view === "chat";
  const showStudio = view === "studio";
  const showProfileFab =
    showRadio &&
    status.authenticated &&
    !!(status.canBroadcast || status.isHost);

  const partyCanTrigger = canTriggerPartyEffects(status);
  const favoritesScope = partyFavoritesScopeForUser(status.user?.id);
  const chatVisible = chatOpen || showChat;
  const selfUserId = status.user?.id ? String(status.user.id) : null;
  const { unreadCount: chatUnreadCount } = useChatUnread({
    enabled: status.authenticated,
    chatVisible,
  });
  const { typers: chatTypers } = useChatTyping({
    canChat: status.authenticated,
    selfUserId,
  });
  const othersTyping = chatTypers.length > 0 && !chatVisible;

  return (
    <PartyEffectsLayer
      active
      canTrigger={partyCanTrigger}
      favoritesScope={favoritesScope}
      hotkeysEnabled={!showStudio}
    >
    <SitePresenceTracker
      listening={player.playing}
      authUser={status.user ?? null}
    />
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-start justify-center p-0 pt-6 pb-16 px-3 sm:items-center sm:justify-center sm:p-4 sm:pb-4">
      <StageDock
        hosts={stageHosts}
        loading={stageLoading}
        needsAuth={stageNeedsAuth}
        visible={showRadio}
        broadcasterUserId={player.broadcasterUserId}
        streamActive={player.streamActive}
        auth={status}
      />

      <div className="w-full sm:max-w-2xl px-3">
        {showStage && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30">
            <StageGrid
              hosts={stageHosts}
              loading={stageLoading}
              needsAuth={stageNeedsAuth}
              broadcasterUserId={player.broadcasterUserId}
              streamActive={player.streamActive}
              auth={status}
            />
          </div>
        )}

        {showChat && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30">
            <ChatPanel auth={status} open embedded onClose={() => setView("radio")} broadcasterUserId={player.broadcasterUserId} />
          </div>
        )}

        {showStudio && (
          <div className="sm:hidden fixed inset-0 top-0 bottom-16 z-30 overflow-y-auto">
            <BroadcasterPage embedded />
          </div>
        )}

        {showRadio && (
          <div className="bg-transparent sm:bg-gradient-to-br sm:from-gray-800 sm:to-gray-900 sm:rounded-2xl sm:shadow-2xl p-0 sm:p-8 sm:border sm:border-gray-700 relative overflow-visible">
            <RadioPanel
              player={player}
              onOpenAbout={() => setAboutOpen(true)}
              onOpenBroadcast={() => setBroadcastOpen(true)}
              showBroadcastButton={showProfileFab}
              broadcastLive={isLive}
              onOpenSearch={() => setSearchOpen(true)}
              guest={null}
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
      <ProfileFab visible={showProfileFab} />
      <ChatPanel
        auth={status}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        broadcasterUserId={player.broadcasterUserId}
      />
      <MobileNav
        view={view}
        onChange={setView}
        showStudio={!!(status.canBroadcast || status.isHost)}
        chatUnreadCount={chatUnreadCount}
        othersTyping={othersTyping}
      />
      <ChatMessagePingLayer
        active={status.authenticated}
        selfUserId={selfUserId}
        chatVisible={chatVisible}
        mobileChatAnchorX={status.canBroadcast || status.isHost ? 0.625 : 0.833}
      />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <BroadcastSourceModal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        isLive={isLive}
      />
      {songSearchEnabled && (
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      )}
    </div>
    </PartyEffectsLayer>
  );
}

export function App() {
  const { status } = useAuthStatus();
  const broadcastAuth = useMemo(() => {
    if (!status.authenticated || !(status.canBroadcast || status.isHost)) return null;
    return {
      mode: "session" as const,
      displayName:
        status.user?.displayName?.trim() || status.user?.username?.trim() || "Broadcaster",
    };
  }, [status]);

  return (
    <WebBroadcastProvider auth={broadcastAuth}>
      <PinnedMediaControlProvider>
        <AppContent />
      </PinnedMediaControlProvider>
    </WebBroadcastProvider>
  );
}
