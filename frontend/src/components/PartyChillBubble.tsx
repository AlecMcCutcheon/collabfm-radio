import type { PartyChillBubble as PartyChillBubbleData } from "../utils/partyChillMessages";
import { PARTY_CHILL_BUBBLE_MS } from "../utils/partyChillMessages";

interface PartyChillOverlayProps {
  bubbles: PartyChillBubbleData[];
}

function PartyChillBubbleItem({ bubble }: { bubble: PartyChillBubbleData }) {
  return (
    <>
      <style>{`
        @keyframes party-chill-pop {
          0% {
            opacity: 0;
            transform: translate(-50%, -40%) scale(0.72);
          }
          18% {
            opacity: 1;
            transform: translate(-50%, -58%) scale(1.06);
          }
          35% {
            transform: translate(-50%, -62%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -110%) scale(0.96);
          }
        }
        .party-chill-bubble {
          position: absolute;
          left: ${bubble.x * 100}vw;
          top: ${bubble.y * 100}vh;
          transform: translate(-50%, -50%);
          pointer-events: none;
          animation: party-chill-pop ${PARTY_CHILL_BUBBLE_MS}ms cubic-bezier(0.22, 0.82, 0.24, 1) forwards;
          z-index: 1;
        }
        .party-chill-bubble-inner {
          display: inline-block;
          max-width: min(14rem, 72vw);
          padding: 0.45rem 0.85rem;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(30, 27, 75, 0.94), rgba(67, 56, 202, 0.88));
          border: 1px solid rgba(196, 181, 253, 0.45);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.35),
            0 0 18px rgba(129, 140, 248, 0.25);
          color: #f5f3ff;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          text-align: center;
          white-space: nowrap;
        }
      `}</style>
      <div className="party-chill-bubble" aria-live="polite">
        <span className="party-chill-bubble-inner">{bubble.message}</span>
      </div>
    </>
  );
}

export function PartyChillOverlay({ bubbles }: PartyChillOverlayProps) {
  if (!bubbles.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {bubbles.map((bubble) => (
        <PartyChillBubbleItem key={bubble.id} bubble={bubble} />
      ))}
    </div>
  );
}
