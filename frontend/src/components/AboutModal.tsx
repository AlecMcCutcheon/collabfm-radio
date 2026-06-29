import { useEffect, useState } from "react";
import { Coffee, ExternalLink, Radio, X } from "lucide-react";
import { api } from "../api/client";
import { FMA_CC_SEARCH_URL } from "../constants/fma";
import { JAMENDO_CC_SEARCH_URL } from "../constants/jamendo";

const DONATION_URL =
  "https://www.paypal.com/donate/?business=YSFG23ABNS6HY&no_recurring=0&item_name=If+my+projects+help+you%2C+donations+are+appreciated.+Feedback%2C+issues%2C+or+PRs+help+too%21&currency_code=USD";
const GITHUB_ISSUES_URL = "https://github.com/AlecMcCutcheon/collabfm-radio/issues";

export const DEVELOPER_ABOUT_SECTION_TITLE = "Message from the original developer";

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
      title: "Collaborative social radio",
      body: "CollabFM is a collaborative, self-hosted social radio platform where multiple people can broadcast from their browser or the Chrome extension. Listeners tune in through the web interface, direct stream URLs, or an optional Discord voice bot.",
    },
    {
      title: "Music & copyright",
      body: "CollabFM enforces a configurable content policy by default. The policy engine applies source, artist, and license allowlists to metadata reported by the browser extension—it is not a copyright detector and does not verify licensing legally. New installs default to Free Music Archive and Jamendo because the extension can report track URLs and Creative Commons license metadata there. Default allowed licenses are standard Creative Commons terms suited to non-commercial community radio (CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA, CC BY-ND, CC BY-NC-ND, and CC0), which aligns with CollabFM’s own CC BY-NC 4.0 software license. The extension can capture audio from many tab sources, but only hostnames on your allowlist are permitted—and FMA and Jamendo are included by default because license information is reported automatically there. Admins may add other sources manually; you are responsible for securing appropriate rights for anything you broadcast.",
      links: [
        { href: FMA_CC_SEARCH_URL, label: "Free Music Archive — CC search" },
        { href: JAMENDO_CC_SEARCH_URL, label: "Jamendo — CC search" },
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
      title: "Upgrades & new builds",
      body: "Station operators on Docker can enable container update notifications in Admin → System → Container updates. The GHCR tag to watch (latest or develop) follows the channel baked into your running image; when a newer build is published on that tag, a banner appears at the top of Admin settings with pull and upgrade steps.",
    },
    {
      title: "A note on persistence",
      body: "Chat messages and song requests are kept in memory and may reset when the server restarts or updates.",
    },
    {
      title: DEVELOPER_ABOUT_SECTION_TITLE,
      body: "Thanks for using CollabFM — I hope you enjoy it. Feature requests and bug reports are welcome on GitHub. I read them when I can, but I can't promise when I'll get to them or whether I'll implement a given idea. I'll think every suggestion over. If CollabFM helps you, donations are appreciated.",
      links: [{ href: GITHUB_ISSUES_URL, label: "Report bugs or request features on GitHub" }],
    },
  ];
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const [stationName, setStationName] = useState("This station");
  const [hideDeveloperMessage, setHideDeveloperMessage] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api
      .branding()
      .then((b) => {
        setStationName(b.radioDisplayName || "This station");
        setHideDeveloperMessage(b.hideDeveloperAboutMessage === true);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const sections = buildSections().filter(
    (section) => !hideDeveloperMessage || section.title !== DEVELOPER_ABOUT_SECTION_TITLE,
  );

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
              section.title === "Collaborative social radio" ||
              section.title === "Music & copyright" ||
              section.title === DEVELOPER_ABOUT_SECTION_TITLE;
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

        <div
          className={
            hideDeveloperMessage
              ? "mt-5 sm:mt-6 shrink-0"
              : "flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 mt-5 sm:mt-6 shrink-0"
          }
        >
          {!hideDeveloperMessage ? (
            <a
              href={DONATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-600 bg-gray-800/80 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700/80 transition-colors"
            >
              <Coffee className="w-4 h-4 text-amber-300" />
              Buy me a coffee
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={
              hideDeveloperMessage
                ? "w-full bg-gradient-to-br from-radio-accent to-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:brightness-110 transition-all"
                : "flex-1 bg-gradient-to-br from-radio-accent to-blue-500 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:brightness-110 transition-all"
            }
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
