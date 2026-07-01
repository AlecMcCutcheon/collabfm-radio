import { ArrowLeft, LogOut, Shield } from "lucide-react";
import { AppNavLink } from "../../context/AppNavigationContext";
import { authLogoutUrl } from "../../config";
import { useAuthStatus } from "../../hooks/useAuthStatus";

const fabClass =
  "inline-flex items-center justify-center rounded-full p-3.5 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-gray-300 shadow-lg hover:scale-105 hover:text-radio-accent hover:border-gray-600 transition-all duration-300";

export function AdminOpenButton({ className = "" }: { className?: string }) {
  return (
    <AppNavLink to="/admin" title="Admin settings" className={`${fabClass} ${className}`}>
      <Shield className="w-5 h-5" />
    </AppNavLink>
  );
}

export function AdminBackButton({ className = "" }: { className?: string }) {
  return (
    <AppNavLink to="/" title="Back to radio" className={`${fabClass} ${className}`}>
      <ArrowLeft className="w-5 h-5" />
    </AppNavLink>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  const { status } = useAuthStatus();
  const isSsoSession = status.sessionLoginMethod === "oidc";
  const ssoName = status.ssoNickname?.trim();
  const title = isSsoSession
    ? ssoName
      ? `Sign out of ${ssoName}`
      : "Sign out of SSO"
    : "Sign out";

  return (
    <a href={authLogoutUrl()} title={title} className={`${fabClass} ${className}`}>
      <LogOut className="w-5 h-5" />
    </a>
  );
}
