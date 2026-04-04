import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Send, Terminal, FolderOpen } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { ChatMessageRenderer } from "./ChatMessageRenderer";
import { WorkingIndicator } from "./WorkingIndicator";
import { CommandChips } from "./CommandChips";
import type {
  GsdMessage,
  MessageType,
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
  statusText?: string | null;
  tmuxActive: boolean;
  onBack: () => void;
  onOpenTerminal: () => void;
  onOpenDetails: () => void;
  onSendStateChange?: (isWorking: boolean) => void;
  hideBackButton?: boolean;
  hideDetailsButton?: boolean;
  fillParent?: boolean;
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
  statusText,
  tmuxActive,
  onBack,
  onOpenTerminal,
  onOpenDetails,
  onSendStateChange,
  hideBackButton = false,
  hideDetailsButton = false,
  fillParent = false,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<GsdMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [optimisticWorking, setOptimisticWorking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset optimistic working when real state catches up or after 10s timeout
  useEffect(() => {
    if (!optimisticWorking) return;
    if (sessionState === 'working') {
      setOptimisticWorking(false);
      return;
    }
    const timeout = setTimeout(() => setOptimisticWorking(false), 10_000);
    return () => clearTimeout(timeout);
  }, [optimisticWorking, sessionState]);

  // Compute effective state: optimistic override when server hasn't caught up yet
  const effectiveState = optimisticWorking && sessionState !== 'working' ? 'working' : sessionState;

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
      if (msg.type === "gsd_chat_message") {
        const evt = msg.data as GsdChatMessageEvent;
        if (evt.project !== projectName) return;
        setMessages((prev) => [...prev, evt.message]);
      } else if (msg.type === "gsd_message_updated") {
        const evt = msg.data as GsdChatMessageEvent;
        if (evt.project !== projectName) return;
        setMessages((prev) => {
          if (evt.message.message_type === "hidden") {
            return prev.filter((m) => m.id !== evt.message.id);
          }
          return prev.map((m) =>
            m.id === evt.message.id ? { ...m, ...evt.message } : m
          );
        });
      }
    });
    return unsub;
  }, [projectName]);

  // Feedback handler — optimistic update + API call
  const handleFeedback = useCallback(
    async (messageId: number, correctType: string) => {
      setMessages((prev) => {
        if (correctType === "hidden") return prev.filter((m) => m.id !== messageId);
        return prev.map((m) =>
          m.id === messageId ? { ...m, message_type: correctType as MessageType } : m
        );
      });
      try {
        await api.gsd.feedback(messageId, correctType);
      } catch {
        // Revert on error — refetch messages
        const res = await api.gsd.messages(projectName, 100, 0);
        setMessages(res.messages.reverse());
      }
    },
    [projectName]
  );

  // Reset scroll flag when project changes
  const initialScrollDone = useRef(false);
  useEffect(() => {
    initialScrollDone.current = false;
  }, [projectName]);

  // Scroll to bottom — instant on initial load, no auto-scroll after
  const scrollToBottom = useCallback(() => {
    if (!initialScrollDone.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      initialScrollDone.current = true;
    }
  }, []);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages.length, loading, scrollToBottom]);

  // Clear reopen confirmation when switching projects
  useEffect(() => {
    setShowReopenConfirm(false);
    setPendingMessage(null);
  }, [projectName]);

  // Send message handler
  const handleSend = useCallback(
    async (text: string, force = false) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      // Intercept sends to paused/archived projects
      const isPausedOrArchived = sessionState === "paused" || sessionState === "archived";
      if (isPausedOrArchived && !force) {
        setPendingMessage(trimmed);
        setShowReopenConfirm(true);
        return;
      }

      // Clear confirmation state
      setShowReopenConfirm(false);
      setPendingMessage(null);

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
      setOptimisticWorking(true);
      onSendStateChange?.(true);

      try {
        await api.gsd.send(projectName, trimmed);
      } catch {
        // Could add error toast here; for now silent
      } finally {
        setSending(false);
      }
    },
    [projectName, sending, sessionState, onSendStateChange]
  );

  const handleConfirmSend = useCallback(() => {
    if (pendingMessage) handleSend(pendingMessage, true);
  }, [pendingMessage, handleSend]);

  const handleCancelSend = useCallback(() => {
    setShowReopenConfirm(false);
    setPendingMessage(null);
  }, []);

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
    <div className="flex flex-col" style={fillParent ? { height: '100%' } : { height: 'calc(100dvh - 2rem)' }}>
      {/* Chat header — sticky */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {!hideBackButton && (
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-200 transition-colors active:scale-95"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <span className="font-semibold text-gray-200">{displayName}</span>
          {effectiveState && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                SESSION_STATE_STYLE[effectiveState] || SESSION_STATE_STYLE.archived
              }`}
            >
              {effectiveState}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tmuxActive && (
            <button
              onClick={onOpenTerminal}
              className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-surface-3 transition-colors active:scale-95"
              title="Open Terminal"
            >
              <Terminal size={16} />
            </button>
          )}
          {!hideDetailsButton && (
            <button
              onClick={onOpenDetails}
              className="p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-3 transition-colors active:scale-95"
              title="Project Details"
            >
              <FolderOpen size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Message area — plain scrollable div (chatscope MessageList has scroll bugs) */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-1" ref={scrollContainerRef}>
        {loading ? (
          <MessageSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No messages yet
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-3">
            {messages.map((msg) => (
              <ChatMessageRenderer
                key={msg.id}
                msg={msg}
                onAction={handleChipSelect}
                onFeedback={handleFeedback}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Working indicator — typing indicator position */}
      {effectiveState === "working" && (
        <WorkingIndicator
          sessionUpdatedAt={sessionUpdatedAt}
          contextTokens={contextTokens}
          statusText={statusText}
        />
      )}

      {/* Command chips when waiting */}
      {effectiveState === "waiting" && (
        <CommandChips
          commands={[...GSD_CHIPS]}
          onSelect={handleChipSelect}
        />
      )}

      {/* Reopen confirmation banner */}
      {showReopenConfirm && (
        <div className="bg-amber-500/10 border-t border-amber-500/30 px-4 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-xs text-amber-400">
            This project is {sessionState}. Send anyway?
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCancelSend}
              className="text-xs px-2.5 py-1 rounded border border-border text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSend}
              className="text-xs px-2.5 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              Send anyway
            </button>
          </div>
        </div>
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
