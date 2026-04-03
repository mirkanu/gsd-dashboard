# Research Summary: v4.0 Chat-First Dashboard

**Domain:** Chat-based project monitoring UI (WhatsApp/Telegram-style)
**Researched:** 2026-04-03
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

v4.0 replaces the kanban board with a chat-first interface where each GSD project is a conversation thread. Terminal output from tmux sessions is parsed, classified into typed messages (stage banners, checkpoints, errors, input requests), and rendered as chat bubbles using @chatscope/chat-ui-kit-react. The user interacts by tapping command buttons and typing in a send box that dispatches to tmux via the existing send-keys API.

The stack additions are minimal: 2 client packages (chatscope UI kit + styles) and 1 server package (strip-ansi for ANSI code removal). Everything else -- message persistence, real-time streaming, WebSocket protocol, SQLite storage -- extends existing infrastructure. The message classifier is a custom regex-based module built on patterns already proven in `server/gsd/tmux.js`.

The primary risk is chatscope's styling system (SCSS-based themes) coexisting with Tailwind CSS. This is manageable because chatscope ships pre-compiled CSS with BEM-namespaced classes that don't collide with Tailwind utilities. Dark mode requires approximately 20-30 CSS variable overrides. If chatscope proves too rigid for custom message types, its components can be progressively replaced since the data layer is independent.

The secondary risk is tmux output classification accuracy. Terminal output is noisy, multi-line, and context-dependent. The classifier must handle partial lines, ANSI artifacts, and varying Claude Code output formats. Starting with conservative classification (default to "text" type) and iterating on patterns based on real output is the right approach.

## Key Findings

**Stack:** Add @chatscope/chat-ui-kit-react@^2.1.1 + styles + strip-ansi@6.0.1. Total 3 new packages.
**Architecture:** Server-side classifier parses tmux output into typed messages, persists to extended gsd_messages table, streams via existing WebSocket. Client renders with chatscope components.
**Critical pitfall:** Scroll-to-bottom behavior in MessageList must work reliably when mixing auto-generated messages (fast) with user input (slow). Chatscope handles this, but custom message renderers can break it.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Schema + Classifier Foundation** - Extend gsd_messages table, build classifier module, add strip-ansi
   - Addresses: Message persistence, output parsing, typed message creation
   - Avoids: Building UI before data pipeline is solid

2. **Chat List View** - ConversationList with project rows, unread badges, state indicators
   - Addresses: Primary navigation replacement for kanban board
   - Avoids: Premature detail work before list UX is validated

3. **Chat Window + Message Rendering** - ChatContainer with classified messages, custom renderers for stage/error/input types
   - Addresses: Per-project conversation view, tappable actions
   - Avoids: Scroll bugs by using chatscope MessageList as base

4. **Project Detail Panel + Controls** - Header-tap to access autopilot, file tabs, raw terminal, settings
   - Addresses: All existing controls accessible from chat view
   - Avoids: Losing functionality during transition from kanban

5. **Real-time Streaming + Unread** - WebSocket chat:message events, unread count tracking, typing indicators
   - Addresses: Live feel, notification badges
   - Avoids: Polling-based updates that feel laggy

**Phase ordering rationale:**
- Data pipeline (classifier + persistence) must exist before UI can render anything meaningful
- Chat list is the primary navigation surface; must work before detail views
- Message rendering depends on classifier output types being stable
- Detail panel preserves existing functionality (safe to build last)
- Real-time streaming enhances but doesn't block basic chat display

**Research flags for phases:**
- Phase 1: Classifier patterns need iteration against real tmux output samples
- Phase 3: Custom message renderers (tappable commands) may need chatscope Message.CustomContent API research
- Phase 4: Preserving all existing controls in new layout requires careful inventory

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | chatscope verified on npm/GitHub (React 18 compatible, 2.1.1 current). strip-ansi verified. Concern: chatscope last release May 2025. |
| Features | HIGH | Feature set derived from PROJECT.md active requirements and existing WhatsApp/Telegram UI patterns. Well-understood domain. |
| Architecture | HIGH | Extends existing patterns (tmux capture, SQLite, WebSocket). No new infrastructure. |
| Pitfalls | MEDIUM | Scroll behavior and classifier accuracy are real risks but manageable with iterative approach. |

## Gaps to Address

- Chatscope dark mode: exact CSS variables to override (needs hands-on testing with the library)
- Classifier accuracy: need real tmux output samples from all 6 projects to validate regex patterns
- Mobile chat UX: chatscope's mobile responsiveness needs verification (project is used exclusively at Railway URL, including mobile)
- Transition path: how to gradually migrate from kanban to chat (feature flag? parallel views?)
