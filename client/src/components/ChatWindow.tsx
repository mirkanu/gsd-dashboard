import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { MessageList } from "@chatscope/chat-ui-kit-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { ChatMessageRenderer } from "./ChatMessageRenderer";
import { WorkingIndicator } from "./WorkingIndicator";
import { CommandChips } from "./CommandChips";
import type {
  GsdMessage,
  SessionState,
  GsdChatMessageEvent,
} from "../lib/types";

const GSD_CHIPS = [
  "/gsd:resume-work",
  "/gsd:progress",
  "/gsd:pause-work",
  "/gsd:plan-phase",
] as const;

interface ChatWindowProps {
  projectName: string;
  displayName: string;
  sessionState: SessionState | null;
  sessionUpdatedAt: string | null;
  contextTokens: number | null;
  onBack: () => void;
}

const SESSION_STATE_STYLE: Record<string, string> = {
  working: "bg-emerald-500/20 text-emerald-400",
  waiting: "bg-amber-400/20 text-amber-400",
  paused: "bg-red-500/20 text-red-400",
  archived: "bg-gray-600/20 text-gray-500",
};

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`flex ${i % 3 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div
            className="h-10 rounded-lg bg-surface-3 animate-pulse"
            style={{ width: `${40 + Math.random() * 40}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function ChatWindow({
  projectName,
  displayName,
  sessionState,
  sessionUpdatedAt,
  contextTokens,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<GsdMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch initial messages
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.gsd
      .messages(projectName, 100, 0)
      .then((res) => {
        if (cancelled) return;
        // API returns DESC, reverse for chronological
        setMessages(res.messages.reverse());
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectName]);

  // Subscribe to real-time messages
  useEffect(() => {
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type !== "gsd_chat_message") return;
      const evt = msg.data as GsdChatMessageEvent;
      if (evt.project !== projectName) return;
      setMessages((prev) => [...prev, evt.message]);
    });
    return unsub;
  }, [projectName]);

  // Auto-scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  // Send message handler
  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      // Optimistic outbound message
      const optimistic: GsdMessage = {
        id: Date.now(),
        project: projectName,
        direction: "outbound",
        content: trimmed,
        message_type: "text",
        metadata: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInputText("");
      setSending(true);

      try {
        await api.gsd.send(projectName, trimmed);
      } catch {
        // Could add error toast here; for now silent
      } finally {
        setSending(false);
      }
    },
    [projectName, sending]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(inputText);
    }
  };

  const handleChipSelect = (cmd: string) => {
    setInputText(cmd);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-200 transition-colors active:scale-95"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="font-semibold text-gray-200">{displayName}</span>
          {sessionState && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                SESSION_STATE_STYLE[sessionState] || SESSION_STATE_STYLE.archived
              }`}
            >
              {sessionState}
            </span>
          )}
        </div>
      </div>

      {/* Working indicator */}
      {sessionState === "working" && (
        <WorkingIndicator
          sessionUpdatedAt={sessionUpdatedAt}
          contextTokens={contextTokens}
        />
      )}

      {/* Message area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No messages yet
          </div>
        ) : (
          <MessageList className="h-full">
            {messages.map((msg) => (
              <ChatMessageRenderer
                key={msg.id}
                msg={msg}
                onAction={handleSend}
              />
            ))}
            <div ref={bottomRef} />
          </MessageList>
        )}
      </div>

      {/* Command chips when waiting */}
      {sessionState === "waiting" && (
        <CommandChips
          commands={[...GSD_CHIPS]}
          onSelect={handleChipSelect}
        />
      )}

      {/* Send box */}
      <div className="bg-surface-2 border-t border-border px-4 py-3 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            rows={1}
            className="bg-surface-3 border border-border rounded-lg px-3 py-2 text-sm resize-none w-full focus:outline-none focus:ring-1 focus:ring-accent/50 text-gray-200 placeholder-gray-500"
            style={{ fontSize: 16 }}
            disabled={sending}
          />
          <button
            onClick={() => handleSend(inputText)}
            disabled={!inputText.trim() || sending}
            className="shrink-0 p-2 rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
