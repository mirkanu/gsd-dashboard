import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";

/**
 * Temporary verification component to confirm chatscope renders
 * without style conflicts alongside existing Tailwind styles.
 * Remove after Phase 28 verification is complete.
 */
export function ChatTest() {
  return (
    <div style={{ height: "300px", width: "100%", maxWidth: "500px" }}>
      <MainContainer>
        <ChatContainer>
          <MessageList>
            <Message
              model={{
                message: "Hello from chatscope!",
                sentTime: "just now",
                sender: "System",
                direction: "incoming",
                position: "single",
              }}
            />
          </MessageList>
          <MessageInput placeholder="Type a message..." />
        </ChatContainer>
      </MainContainer>
    </div>
  );
}
