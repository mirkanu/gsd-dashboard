import { StageBanner } from "./StageBanner";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { CompletionCard } from "./CompletionCard";
import { ErrorCard } from "./ErrorCard";
import type { GsdMessage } from "../lib/types";

interface ChatMessageRendererProps {
  msg: GsdMessage;
  onAction?: (text: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function Timestamp({ time }: { time: string }) {
  const str = formatTime(time);
  if (!str) return null;
  return <span className="text-[10px] text-gray-600 mt-0.5">{str}</span>;
}

export function ChatMessageRenderer({ msg, onAction }: ChatMessageRendererProps) {
  const msgType = msg.message_type || "text";

  switch (msgType) {
    case "stage_banner":
      return <StageBanner content={msg.content} />;
    case "checkpoint":
      return (
        <CheckpointPrompt
          content={msg.content}
          metadata={msg.metadata}
          onAction={onAction}
        />
      );
    case "completion":
      return <CompletionCard content={msg.content} />;
    case "error":
      return <ErrorCard content={msg.content} />;
    default: {
      const isOutbound = msg.direction === "outbound";
      return (
        <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
          <div
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
              isOutbound
                ? 'bg-accent text-white'
                : 'bg-surface-3 text-gray-200'
            }`}
          >
            {msg.content}
          </div>
          <Timestamp time={msg.created_at} />
        </div>
      );
    }
  }
}
