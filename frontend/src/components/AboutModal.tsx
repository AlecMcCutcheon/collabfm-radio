import { useEffect, useState } from "react";
import { Radio, X } from "lucide-react";
import { api } from "../api/client";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

function buildSections(stationName: string) {
  return [
    {
      title: "Live web radio",
      body: `${stationName} is a private, in-house radio station. DJs broadcast from their browser using the broadcaster extension; listeners tune in here for live audio, chat, and the stage.`,
    },
    {
      title: "When we're live",
      body: "There is no fixed schedule. The stream goes live when someone starts broadcasting. Watch the LIVE indicator and now-playing info to see if audio is on air.",
    },
    {
      title: "Sign in & roles",
      body: "Hosts sign in with a local account or SSO (if enabled). Broadcasters can go live, manage their on-air profile, pair the browser extension, and create guest listen links. Admins configure the station, users, and Discord voice bot.",
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

  const sections = buildSections(stationName);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4"
      onClick={onClose}
    >
      <div
        className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-[26rem] border border-gray-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-radio-accent" />
            <h3 className="text-lg font-bold text-white">About {stationName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-sm text-gray-300 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pr-1">
          {sections.map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold text-white mb-2">{section.title}</h4>
              <p>{section.body}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 bg-gradient-to-br from-radio-accent to-blue-500 text-white rounded-xl px-4 py-2 text-sm hover:brightness-110 transition-all"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}
