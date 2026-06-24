---
sketch: 001
name: llm-provider-selector
question: "How should the provider selector look and behave?"
winner: "B"
tags: [selector, dropdown]
---

# Sketch 001: LLM Provider Selector

## Design Question
How should the LLM provider selector look and behave for quick switching between Claude subscription, z.AI, and local Ollama?

## How to View
Open `.planning/sketches/001-llm-provider-selector/index.html` in a browser.

## Variants
- **A: Dropdown** — Simple select dropdown matching Config page Verbosity selector
- **B: Radio Cards** — Card-based radio buttons with larger click targets
- **C: Inline** — Minimal inline selector with hot-reload hint

## What to Look For
- Which selector pattern feels fastest for switching when hitting API limits?
- Does the pattern match the technical dashboard aesthetic?
- Is the current provider status clear?
