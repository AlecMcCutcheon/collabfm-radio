import { useEffect, useState } from "react";
import { Coffee, ExternalLink, Radio, X } from "lucide-react";
import { api } from "../api/client";
import { FMA_CC_SEARCH_URL } from "../constants/fma";
import { JAMENDO_EXPLORE_URL } from "../constants/jamendo";

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
  body?: string;
  blocks?: Array<
    | { kind: "paragraph"; text: string }
    | { kind: "subheading"; text: string }
    | { kind: "list"; items: string[] }
  >;
  links?: { href: string; label: string }[];
}

function AboutSectionBody({ section }: { section: AboutSection }) {
  if (section.blocks?.length) {
    return (
      <div className="space-y-3">
        {section.blocks.map((block, index) => {
          if (block.kind === "subheading") {
            return (
              <h5 key={index} className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">
                {block.text}
              </h5>
            );
          }
          if (block.kind === "list") {
            return (
              <ul key={index} className="list-disc pl-5 space-y-1.5 text-gray-300">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            );
          }
          return (
            <p key={index} className="leading-relaxed">
              {block.text}
            </p>
          );
        })}
        {section.links && section.links.length > 0 ? (
          <ul className="space-y-2 pt-1">
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
  }

  return (
    <>
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
    </>
  );
}

function buildSections(): AboutSection[] {
  return [
    {
      title: "Collaborative social radio",
      body: "CollabFM is a shared, community-run radio station. People take turns broadcasting from their browser, and everyone else can listen along on the web or in Discord and chat together in real time.",
    },
    {
      title: "Music & copyright",
      blocks: [
        {
          kind: "paragraph",
          text: "CollabFM does not host, store, or provide any audio content—it relays audio that broadcasters supply from their own browser tabs or sources.",
        },
        { kind: "subheading", text: "How filtering works" },
        {
          kind: "paragraph",
          text: "Stations can turn on a content policy that does best-effort filtering using the track details a source reports—things like the track title, artist, source site, and the license label attached to it.",
        },
        {
          kind: "list",
          items: [
            "It checks that reported info against allowlists the station sets up.",
            "It reads the license label a source provides—it does not listen to, fingerprint, or legally verify the audio.",
            "It is a filtering aid, not a copyright checker.",
          ],
        },
        { kind: "subheading", text: "Where the music comes from" },
        {
          kind: "paragraph",
          text: "New stations start with Free Music Archive and Jamendo because those sites publish clear, machine-readable license labels that make filtering easier.",
        },
        {
          kind: "list",
          items: [
            "A Creative Commons label doesn't remove every requirement—some still need credit or have other terms.",
            "Reported details can be missing or wrong, so nothing here is a guarantee.",
          ],
        },
        { kind: "subheading", text: "The bottom line" },
        {
          kind: "paragraph",
          text: "The station's admins choose which sources are allowed and are responsible for having the rights to what gets broadcast. If you host your own station, that responsibility is yours.",
        },
      ],
      links: [
        { href: FMA_CC_SEARCH_URL, label: "Free Music Archive — CC search" },
        { href: JAMENDO_EXPLORE_URL, label: "Jamendo — explore music" },
      ],
    },
    {
      title: "When we're live",
      body: "There's no fixed schedule—the station goes live when someone starts broadcasting. Watch for the LIVE badge and the now-playing line to see if anyone's on air.",
    },
    {
      title: "Signing in",
      body: "Most stations let you sign in with a username and password, or a single sign-on button if your host set that up. After that, open Studio from your profile to customize how you appear on stage and in chat.",
    },
    {
      title: "Stage, chat & requests",
      body: "During a show, the stage shows who's on air and connected. Chat is in the player, and when the station allows it you can search for a track and send a request for the DJ to approve.",
    },
    {
      title: "Hearts & DJ levels",
      body: "Tap the heart on a track you like—it can help the DJ earn level progress when the station allows it. Approving someone else's request can help them level up too.",
    },
    {
      title: "Listen on Discord",
      body: "Some stations mirror the live stream into a Discord voice channel through a bot. Ask your host for the server invite if you'd rather listen there.",
    },
    {
      title: "Share a listen link",
      body: "Signed-in users can create a link so friends tune in without an account. You get a web-player link and a direct stream URL, and links can expire after a set time.",
    },
    {
      title: "Your account",
      body: "Your login and profile live on this station's server—not a central CollabFM account shared across sites. Studio is where you update your password, avatar, and optional two-factor sign-in.",
    },
    {
      title: "Chat history",
      body: "Messages and requests stay in memory while the station is running. They can disappear after a restart or update, so don't count on them as a permanent log.",
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
              <AboutSectionBody section={section} />
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
