import { AppNavLink } from "../../context/AppNavigationContext";
import { ArrowLeft } from "lucide-react";

const fabClass =
  "inline-flex items-center justify-center rounded-full p-3.5 bg-gradient-to-b from-gray-800 to-gray-900 border border-gray-700 text-gray-300 shadow-lg hover:scale-105 hover:text-radio-accent hover:border-gray-600 transition-all duration-300";

export function AdminSettingsBackButton({ className = "" }: { className?: string }) {
  return (
    <AppNavLink to="/admin" title="Back to admin" className={`${fabClass} ${className}`}>
      <ArrowLeft className="w-5 h-5" />
    </AppNavLink>
  );
}
