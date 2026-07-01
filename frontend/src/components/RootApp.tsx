import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { AppNavigationProvider, useAppNavigation } from "../context/AppNavigationContext";
import { BrandingFeaturesProvider } from "../context/BrandingFeaturesContext";
import { RadioPlayerProvider } from "../context/RadioPlayerContext";
import { useAuthStatus } from "../hooks/useAuthStatus";
import { useStationTitle } from "../hooks/useStationTitle";
import { AdminPage } from "../pages/AdminPage";
import { BroadcasterPage } from "../pages/BroadcasterPage";
import { LandingPage } from "../pages/LandingPage";
import { ListenPage } from "../pages/ListenPage";
import { SetupPage } from "../pages/SetupPage";
import { pageTitleSuffix } from "../utils/stationTitle";
import { App } from "./App";
import { PartyEffectsLayer } from "./PartyEffectsLayer";
import { canTriggerPartyEffects } from "../utils/stagePermissions";
import { partyFavoritesScopeForUser } from "../utils/partyEffectFavorites";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-400">
      Loading…
    </div>
  );
}

function BroadcasterWithPartyEffects() {
  const { status, loading } = useAuthStatus();
  if (loading) return <LoadingScreen />;

  const partyCanTrigger = canTriggerPartyEffects(status);
  const favoritesScope = partyFavoritesScopeForUser(status.user?.id);

  return (
    <PartyEffectsLayer
      active
      canTrigger={partyCanTrigger}
      favoritesScope={favoritesScope}
    >
      <BroadcasterPage />
    </PartyEffectsLayer>
  );
}

function AuthenticatedApp() {
  const { path } = useAppNavigation();
  const { status, loading } = useAuthStatus();

  if (loading) return <LoadingScreen />;

  let content: ReactNode;

  if (path === "/admin") {
    if (status.roleInfo?.roleType !== "admin") {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-red-400">
          Admin access required.
        </div>
      );
    }
    if (!status.authenticated) {
      content = <LandingPage />;
    } else {
      content = <AdminPage />;
    }
  } else if (path === "/broadcaster") {
    if (!status.authenticated) {
      content = <LandingPage />;
    } else {
      content = <BroadcasterWithPartyEffects />;
    }
  } else if (!status.authenticated) {
    content = <LandingPage />;
  } else {
    content = <App />;
  }

  const keepPlayerAlive =
    status.authenticated &&
    (path === "/" || path === "/admin" || path === "/broadcaster");

  if (keepPlayerAlive) {
    return <RadioPlayerProvider>{content}</RadioPlayerProvider>;
  }

  return content;
}

function RootAppInner() {
  const { path } = useAppNavigation();
  const { status } = useAuthStatus();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const canBroadcast = !!(status.canBroadcast || status.isHost);

  useStationTitle(
    pageTitleSuffix(path, setupComplete, {
      canBroadcast: path === "/broadcaster" ? canBroadcast : undefined,
    }),
  );

  useEffect(() => {
    void api.setupStatus().then((s) => setSetupComplete(s.complete));
  }, []);

  if (setupComplete === null) return <LoadingScreen />;
  if (!setupComplete) {
    return <SetupPage onComplete={() => setSetupComplete(true)} />;
  }
  if (path.startsWith("/listen/")) {
    return <ListenPage />;
  }
  return <AuthenticatedApp />;
}

export function RootApp() {
  return (
    <AppNavigationProvider>
      <BrandingFeaturesProvider>
        <RootAppInner />
      </BrandingFeaturesProvider>
    </AppNavigationProvider>
  );
}
