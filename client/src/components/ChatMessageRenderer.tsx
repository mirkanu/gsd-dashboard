import * as ContextMenu from "@radix-ui/react-context-menu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { StageBanner } from "./StageBanner";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { CompletionCard } from "./CompletionCard";
import { ErrorCard } from "./ErrorCard";
import { NextUpCard } from "./NextUpCard";
import type { GsdMessage } from "../lib/types";

interface ChatMessageRendererProps {
  msg: GsdMessage;
  onAction?: (text: string) => void;
  onFeedback?: (messageId: number, correctType: string) => void;
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

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  hidden: "Hidden",
  stage_banner: "Stage Banner",
  next_up: "Next Up",
  checkpoint: "Checkpoint",
  completion: "Completion",
  error: "Error",
};

function MessageContextMenu({
  children,
  msg,
  onFeedback,
}: {
  children: React.ReactNode;
  msg: GsdMessage;
  onFeedback?: (messageId: number, correctType: string) => void;
}) {
  if (!onFeedback || msg.direction === "outbound") return <>{children}</>;

  const currentType = msg.message_type || "text";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div style={{ WebkitTouchCallout: "none" }}>{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="bg-surface-2 border border-border rounded-lg shadow-xl p-1 min-w-[160px] z-50">
          <ContextMenu.Label className="px-3 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider">
            Reclassify as...
          </ContextMenu.Label>
          {Object.entries(MESSAGE_TYPE_LABELS).map(([type, label]) => (
            <ContextMenu.Item
              key={type}
              disabled={type === currentType}
              onSelect={() => onFeedback(msg.id, type)}
              className="px-3 py-2 text-sm text-gray-200 cursor-pointer rounded hover:bg-surface-3 outline-none data-[disabled]:opacity-40 data-[disabled]:cursor-default data-[highlighted]:bg-surface-3"
            >
              {label}
              {type === currentType && (
                <span className="ml-2 text-[10px] text-gray-500">(current)</span>
              )}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function looksLikeTerminal(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  // Box-drawing characters (─ │ ┌ ┐ └ ┘ ├ ┤ etc.)
  const boxChars = lines.filter(l => /[─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]/.test(l)).length;
  if (boxChars >= 2) return true;
  // Indentation-heavy: >60% of lines start with 2+ spaces
  const indented = lines.filter(l => /^ {2,}\S/.test(l)).length;
  if (lines.length >= 3 && indented / lines.length > 0.6) return true;
  return false;
}

export function ChatMessageRenderer({ msg, onAction, onFeedback }: ChatMessageRendererProps) {
  const msgType = msg.message_type || "text";

  switch (msgType) {
    case "stage_banner":
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <StageBanner content={msg.content} />
        </MessageContextMenu>
      );
    case "checkpoint":
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <CheckpointPrompt
            content={msg.content}
            metadata={msg.metadata}
            onAction={onAction}
          />
        </MessageContextMenu>
      );
    case "completion":
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <CompletionCard content={msg.content} />
        </MessageContextMenu>
      );
    case "error":
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <ErrorCard content={msg.content} />
        </MessageContextMenu>
      );
    case "next_up":
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <NextUpCard content={msg.content} onAction={onAction} />
        </MessageContextMenu>
      );
    default: {
      const isOutbound = msg.direction === "outbound";
      const renderContent = () => {
        if (isOutbound) {
          return <>{msg.content}</>;
        }
        if (looksLikeTerminal(msg.content)) {
          return (
            <pre className="text-sm font-mono whitespace-pre-wrap break-words text-gray-200">{msg.content}</pre>
          );
        }
        return (
          <div className="prose prose-sm prose-invert max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:bg-black/30 prose-pre:rounded prose-code:text-emerald-300 prose-table:text-xs prose-th:px-2 prose-td:px-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        );
      };
      return (
        <MessageContextMenu msg={msg} onFeedback={onFeedback}>
          <div className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                isOutbound
                  ? 'bg-accent text-white'
                  : 'bg-surface-3 text-gray-200'
              }`}
            >
              {renderContent()}
            </div>
            <Timestamp time={msg.created_at} />
          </div>
        </MessageContextMenu>
      );
    }
  }
}
