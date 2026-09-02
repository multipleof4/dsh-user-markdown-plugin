# dsh-user-markdown-plugin

A Cordis plugin for DeepSeek Harness (DSH) Web GUI that extends user message rendering to support full Markdown formatting (headings, bold, italic, inline code, code blocks, lists, blockquotes, tables, links, and reference chips).

## Features

- **Markdown Rendering for User Messages**: Renders code blocks, inline code, lists, headings, tables, blockquotes, bold/italic text, links, and `@file`/`@session` reference chips in user message bubbles.
- **Keyed Slot Registration**: Injects into the `conversation.chat.node` slot for keys `user` and `steering`.
- **Copy Action & Image Support**: Preserves image attachments and adds a hover copy action button.

## Usage

### As a Dynamic Cordis Plugin

In a running DSH session, define and activate the plugin using `cordis_define` and `cordis_run`.
