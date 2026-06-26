import { UserCircle } from "lucide-react";
import { AppNavLink } from "../context/AppNavigationContext";

const fabClass =
  "inline-flex items-center justify-center rounded-full p-4 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-white shadow-lg hover:scale-110 hover:text-radio-accent hover:border-gray-600 transition-all duration-300";

export function ProfileFab({
  visible,
  to = "/broadcaster",
  title = "Broadcaster studio & profile",
}: {
  visible: boolean;
  to?: string;
  title?: string;
}) {
  if (!visible) return null;

  return (
    <div className="hidden sm:block fixed top-6 right-6 z-40">
      <AppNavLink to={to} title={title} className={fabClass}>
        <UserCircle className="w-6 h-6" />
      </AppNavLink>
    </div>
  );
}
