import { useEffect, useState } from "react";
import { ExternalLink, Radio, X } from "lucide-react";
import { api } from "../api/client";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

interface AboutSection {
  title: string;
  body: string;
  links?: { href: string; label: string }[];
}

function buildSections(): AboutSection[] {
  return [
    {
      title: "Live web radio",
      body: "CollabFM is a self-hosted collaborative internet radio where multiple people can broadcast from their browser or the Chrome extension. Listeners can tune in through the web interface, direct stream URLs, or an optional Discord voice bot.",
    },
    {
      title: "Music & copyright",
      body: "CollabFM enforces a configurable content policy by default. The policy engine is a filtering tool—it applies allowlists to metadata from the extension, not a copyright detector. Default rules may reference royalty-free or creator-friendly sources as convenience only, not guarantees that every track is cleared for your use. You are responsible for securing appropriate rights and licenses. Common starting points:",
      links: [
        { href: "https://ncs.io", label: "NoCopyrightSounds (ncs.io)" },
        { href: "https://pixabay.com/music/", label: "Pixabay Music" },
      ],
    },
    {
      title: "When we're live",
      body: "There is no fixed schedule. The stream goes live when someone starts broadcasting. Watch the LIVE indicator and now-playing info to see if audio is on air.",
    },
    {
      title: "Sign in & roles",
      body: "Hosts sign in with a local account or SSO when enabled. Broadcasters can go live, manage their on-air profile, pair the browser extension, and create guest listen links. Admins configure the station, users, content policy, and Discord voice bot.",
    },
    {
      title: "Stage, chat & requests",
      body: "The stage shows who is connected while a broadcast is active. Live chat runs in the web app. When enabled, listeners can search and request songs during a live show.",
    },
    {
      title: "Discord voice mirror",
      body: "An optional Discord bot can join whitelisted servers with /join to play the same audio in a voice channel — handy for friends who prefer Discord.",
    },
    {
      title: "Guest listening",
      body: "Broadcasters can share time-limited listen links for the web player or a direct stream URL (OBS, VLC, etc.) without a full account.",
    },
    {
      title: "A note on persistence",
      body: "Chat messages and song requests are kept in memory and may reset when the server restarts or updates.",
    },
  ];
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [stationName, setStationName] = useState("This station");

  useEffect(() => {
    if (!open) return;
    void api
      .branding()
      .then((b) => setStationName(b.radioDisplayName || "This station"))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const sections = buildSections();

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 lg:p-8 w-full max-w-3xl border border-gray-700 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 sm:mb-5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-5 h-5 text-radio-accent shrink-0" />
            <h3 className="text-lg sm:text-xl font-bold text-white truncate">
              About {stationName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors shrink-0 ml-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 text-sm text-gray-300 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pr-1 min-h-0 flex-1">
          {sections.map((section) => {
            const fullWidth =
              section.title === "Live web radio" || section.title === "Music & copyright";
            const highlighted = section.title === "Music & copyright";
            return (
            <div
              key={section.title}
              className={
                fullWidth
                  ? `sm:col-span-2${highlighted ? " rounded-xl border border-gray-700/80 bg-gray-900/40 p-4" : ""}`
                  : ""
              }
            >
              <h4 className="font-semibold text-white mb-2">{section.title}</h4>
              <p className="leading-relaxed">{section.body}</p>
              {section.links && section.links.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-radio-accent hover:underline"
                      >
                        {link.label}
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 sm:mt-6 bg-gradient-to-br from-radio-accent to-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:brightness-110 transition-all shrink-0"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
