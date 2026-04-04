import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import {
  MessageList,
  Message,
  MessageSeparator,
} from "@chatscope/chat-ui-kit-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type {
  GsdMessage,
  SessionState,
  GsdChatMessageEvent,
} from "../lib/types";

interface ChatWindowProps {
  projectName: string;
  displayName: string;
  sessionState: SessionState | null;
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

function StageBanner({ content }: { content: string }) {
  return (
    <MessageSeparator>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {content}
      </span>
    </MessageSeparator>
  );
}

function SpecialCard({
  content,
  variant,
}: {
  content: string;
  variant: "checkpoint" | "completion" | "error";
}) {
  const styles = {
    checkpoint:
      "border-amber-500/40 bg-amber-500/5 text-amber-300",
    completion:
      "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
    error:
      "border-red-500/40 bg-red-500/5 text-red-300",
  };

  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const collapsible = variant === "error" && lines.length > 3;

  return (
    <div className={`mx-4 my-2 rounded-lg border px-3 py-2 text-sm ${styles[variant]}`}>
      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
        {collapsible && !expanded ? lines.slice(0, 3).join("\n") + "\n..." : content}
      </pre>
      {collapsible && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[10px] underline opacity-70 hover:opacity-100"
        >
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

export function ChatWindow({
  projectName,
  displayName,
  sessionState,
  onBack,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<GsdMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const renderMessage = (msg: GsdMessage) => {
    const msgType = msg.message_type || "text";

    switch (msgType) {
      case "stage_banner":
        return <StageBanner key={msg.id} content={msg.content} />;
      case "checkpoint":
        return (
          <SpecialCard key={msg.id} content={msg.content} variant="checkpoint" />
        );
      case "completion":
        return (
          <SpecialCard key={msg.id} content={msg.content} variant="completion" />
        );
      case "error":
        return (
          <SpecialCard key={msg.id} content={msg.content} variant="error" />
        );
      default: {
        const direction =
          msg.direction === "outbound" ? "outgoing" : "incoming";
        return (
          <Message
            key={msg.id}
            model={{
              message: msg.content,
              direction,
              position: "single",
            }}
          />
        );
      }
    }
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
            {messages.map(renderMessage)}
            <div ref={bottomRef} />
          </MessageList>
        )}
      </div>
    </div>
  );
}
