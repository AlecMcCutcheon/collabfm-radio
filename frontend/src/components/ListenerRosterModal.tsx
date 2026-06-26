import { useState, type ReactNode } from "react";
import { Bot, Headphones, Mic, Users, X } from "lucide-react";
import type { AuthUser, DiscordBotConnection, GuestContext, PresenceMember } from "../types/api";
import { formatDiscordBotStationLabel } from "../utils/discordBotStage";
import { stageMemberAvatarSrc } from "../utils/avatar";
import { avatarImageFallbackHandler } from "../utils/brandingImage";
import type { StageHostGroup } from "../utils/stageHosts";
import { ProfilePreviewMenu } from "./ProfilePreviewMenu";

interface ListenerRosterModalProps {
  open: boolean;
  onClose: () => void;
  stage?: PresenceMember[];
  listening: PresenceMember[];
  online: PresenceMember[];
  botConnections?: DiscordBotConnection[];
  loading?: boolean;
  authUser?: AuthUser | null;
  guest?: GuestContext | null;
}

function memberToHost(member: PresenceMember): StageHostGroup {
  return {
    userId: member.userId,
    displayName: member.displayName,
    avatar: member.avatar,
    roleColor: member.roleColor ?? null,
    guestAvatarVariant: member.avatarVariant ?? 0,
    guestCoverIcon: member.coverIcon ?? 0,
    level: member.isGuest ? null : { level: member.level ?? 1, experiencePoints: 0, xpIntoLevel: 0, xpForNextLevel: 0, progressPct: 0 },
    connections: [],
    hasActiveConnection: false,
    isGhost: true,
    onStage: member.onStage ?? false,
    listening: member.listening ?? false,
  };
}

function MemberRow({
  member,
  onSelect,
}: {
  member: PresenceMember;
  onSelect: (member: PresenceMember, anchor: DOMRect) => void;
}) {
  const showLevel = !member.isGuest && (member.level ?? 0) > 0;
  const badges = [
    member.onStage ? (
      <span
        key="live"
        className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
      >
        <Mic className="w-3 h-3" />
        Live
      </span>
    ) : null,
    member.listening ? (
      <span
        key="listening"
        className="inline-flex items-center gap-1 rounded-full border border-sky-300/30 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-radio-accent"
      >
        <Headphones className="w-3 h-3" />
        Listening
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-gray-700/60 transition-colors"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelect(member, rect);
        }}
      >
        <div className="w-9 h-9 shrink-0 rounded-full overflow-hidden ring-1 ring-gray-600/80">
          <img
            src={stageMemberAvatarSrc(member, 72)}
            alt=""
            className="w-full h-full object-cover"
            onError={avatarImageFallbackHandler(member.userId || member.displayName, 72)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-sm font-medium truncate"
              style={{ color: member.roleColor ?? "#f3f4f6" }}
            >
              {member.displayName}
            </span>
            {showLevel ? (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Lv {member.level}
              </span>
            ) : null}
          </div>
          {badges.length > 0 ? <div className="mt-1 flex flex-wrap gap-1">{badges}</div> : null}
        </div>
      </button>
    </li>
  );
}

function RosterSection({
  title,
  icon,
  members,
  emptyLabel,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  members: PresenceMember[];
  emptyLabel: string;
  onSelect: (member: PresenceMember, anchor: DOMRect) => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-semibold text-white">
          {title} <span className="text-gray-400 font-normal">({members.length})</span>
        </h4>
      </div>
      {members.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">{emptyLabel}</p>
      ) : (
        <ul className="space-y-0.5">
          {members.map((member) => (
            <MemberRow key={member.userId} member={member} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BotConnectionRow({ connection }: { connection: DiscordBotConnection }) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-indigo-300/30 bg-indigo-400/10 text-indigo-200">
        <Bot className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-white truncate">
            {connection.guildName}
          </span>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
            Bot
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate">
          {connection.botName} in {connection.channelName}
        </p>
        <p className="text-xs text-gray-500 truncate">
          Listening to {formatDiscordBotStationLabel(connection)}
        </p>
      </div>
    </li>
  );
}

function BotConnectionSection({ connections }: { connections: DiscordBotConnection[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Bot className="w-4 h-4 text-indigo-300" />
        <h4 className="text-sm font-semibold text-white">
          Discord voice <span className="text-gray-400 font-normal">({connections.length})</span>
        </h4>
      </div>
      {connections.length === 0 ? (
        <p className="text-sm text-gray-500 px-1">No Discord voice bot connections right now.</p>
      ) : (
        <ul className="space-y-0.5">
          {connections.map((connection) => (
            <BotConnectionRow key={connection.id} connection={connection} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ListenerRosterModal({
  open,
  onClose,
  stage = [],
  listening,
  online,
  botConnections = [],
  loading = false,
  authUser,
  guest,
}: ListenerRosterModalProps) {
  const [profileTarget, setProfileTarget] = useState<{
    host: StageHostGroup;
    anchor: DOMRect;
  } | null>(null);

  if (!open) return null;

  const handleSelect = (member: PresenceMember, anchor: DOMRect) => {
    setProfileTarget({ host: memberToHost(member), anchor });
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4"
        onClick={onClose}
      >
        <div
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 sm:p-6 w-[94%] max-w-md border border-gray-700 shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-party"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-labelledby="listener-roster-title"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-radio-accent" />
              <h3 id="listener-roster-title" className="text-lg font-bold text-white">
                Who&apos;s here
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading && stage.length === 0 && listening.length === 0 && online.length === 0 && botConnections.length === 0 ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <div className="space-y-5">
              <RosterSection
                title="Online"
                icon={<Users className="w-4 h-4 text-gray-400" />}
                members={online}
                emptyLabel="Nobody else is on the site right now."
                onSelect={handleSelect}
              />
              <BotConnectionSection connections={botConnections} />
            </div>
          )}
        </div>
      </div>

      {profileTarget && (
        <ProfilePreviewMenu
          host={profileTarget.host}
          anchor={profileTarget.anchor}
          onClose={() => setProfileTarget(null)}
          authUser={authUser ?? null}
          guest={guest}
        />
      )}
    </>
  );
}
