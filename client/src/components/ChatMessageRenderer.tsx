import { Message } from "@chatscope/chat-ui-kit-react";
import { StageBanner } from "./StageBanner";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { CompletionCard } from "./CompletionCard";
import { ErrorCard } from "./ErrorCard";
import type { GsdMessage } from "../lib/types";

interface ChatMessageRendererProps {
  msg: GsdMessage;
  onAction?: (text: string) => void;
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
      const direction =
        msg.direction === "outbound" ? "outgoing" : "incoming";
      return (
        <Message
          model={{
            message: msg.content,
            direction,
            position: "single",
          }}
        />
      );
    }
  }
}
