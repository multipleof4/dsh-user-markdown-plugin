/**
 * Client half of dsh-user-markdown-plugin.
 * Registers a user message Chat Node renderer for 'user' and 'steering' keys
 * that parses and renders Markdown formatted text.
 */
export function apply(ctx) {
  const slots = ctx.get('slots');
  if (!slots) return;

  function contentParts(content) {
    if (!Array.isArray(content)) {
      if (typeof content === 'string') return { text: content, images: [], rest: [] };
      return { text: '', images: [], rest: [] };
    }
    const texts = [];
    const images = [];
    const rest = [];
    for (const block of content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      } else if (block && block.type === 'image' && block.attachment !== undefined) {
        images.push({ attachment: block.attachment });
      } else if (block) {
        rest.push(block);
      }
    }
    return { text: texts.join(''), images, rest };
  }

  function renderInline(text, referenceLabels) {
    if (!text) return null;
    const refLabels = Array.isArray(referenceLabels) ? referenceLabels : [];
    const tokens = [];
    const regex = /(`[^`]+`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*\*([^*]+)\*\*\*|___([^_]+)___)|(\*\*([^*]+)\*\*|__([^_]+)__)|(\*([^*]+)\*|_([^_]+)_)|(~~([^~]+)~~)|((?:^|\s)(?:\/[\w-]+|@"[^"\n]+"|@[^\s]+))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      if (match[1]) {
        tokens.push({ type: 'code', content: match[1].slice(1, -1) });
      } else if (match[2]) {
        tokens.push({ type: 'link', label: match[3], url: match[4] });
      } else if (match[5]) {
        tokens.push({ type: 'bold_italic', content: match[6] || match[7] });
      } else if (match[8]) {
        tokens.push({ type: 'bold', content: match[9] || match[10] });
      } else if (match[11]) {
        tokens.push({ type: 'italic', content: match[12] || match[13] });
      } else if (match[14]) {
        tokens.push({ type: 'strike', content: match[15] });
      } else if (match[16]) {
        const raw = match[16];
        const leadingSpace = raw.match(/^\s*/)[0];
        if (leadingSpace) {
          tokens.push({ type: 'text', content: leadingSpace });
        }
        tokens.push({ type: 'ref', content: raw.trim() });
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      tokens.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return tokens.map((token, idx) => {
      switch (token.type) {
        case 'code':
          return React.createElement('code', { key: idx, className: 'dsh-user-inline-code' }, token.content);
        case 'link':
          return React.createElement('a', {
            key: idx,
            href: token.url,
            target: '_blank',
            rel: 'noopener noreferrer',
            className: 'dsh-user-link'
          }, token.label);
        case 'bold_italic':
          return React.createElement('strong', { key: idx }, React.createElement('em', null, token.content));
        case 'bold':
          return React.createElement('strong', { key: idx }, token.content);
        case 'italic':
          return React.createElement('em', { key: idx }, token.content);
        case 'strike':
          return React.createElement('del', { key: idx }, token.content);
        case 'ref': {
          const label = token.content;
          const isSession = refLabels.includes(label.slice(1));
          const refKind = isSession ? 'session' : label.startsWith('@') ? (label.endsWith('/') ? 'folder' : 'file') : 'command';
          const displayLabel = refKind === 'session' ? label.slice(1) : label.startsWith('@') ? label.slice(1).replace(/^"|"$/g, '').split(/[\\/]/).filter(Boolean).pop() || label.slice(1) : label;
          return React.createElement('span', {
            key: idx,
            className: 'dsh-user-ref-chip',
            'data-ref-chip': refKind,
            title: label
          }, displayLabel);
        }
        case 'text':
        default:
          return token.content;
      }
    });
  }

  function parseMarkdownBlocks(text) {
    const blocks = [];
    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        const lang = line.trim().slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
        continue;
      }

      if (line.trim() === '') {
        i++;
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
        i++;
        continue;
      }

      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        blocks.push({ type: 'hr' });
        i++;
        continue;
      }

      if (/^\s*>\s?(.*)$/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^\s*>\s?(.*)$/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
        continue;
      }

      if (/^\s*[-*+]\s+(.*)$/.test(line) || /^\s*\d+\.\s+(.*)$/.test(line)) {
        const isOrdered = /^\s*\d+\.\s+(.*)$/.test(line);
        const items = [];
        const itemRegex = isOrdered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
        while (i < lines.length && itemRegex.test(lines[i])) {
          const m = lines[i].match(itemRegex);
          if (m) items.push(m[1]);
          i++;
        }
        blocks.push({ type: isOrdered ? 'ol' : 'ul', items });
        continue;
      }

      if (line.trim().startsWith('|') && line.trim().endsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i + 1])) {
        const parseRow = (l) => l.trim().slice(1, -1).split('|').map(c => c.trim());
        const headers = parseRow(lines[i]);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(parseRow(lines[i]));
          i++;
        }
        blocks.push({ type: 'table', headers, rows });
        continue;
      }

      const paraLines = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].match(/^#{1,6}\s+/) &&
        !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i])
      ) {
        paraLines.push(lines[i]);
        i++;
      }
      if (paraLines.length > 0) {
        blocks.push({ type: 'p', text: paraLines.join('\n') });
      }
    }

    return blocks;
  }

  function UserMarkdownRenderer({ text, referenceLabels }) {
    const blocks = parseMarkdownBlocks(text);
    return React.createElement('div', { className: 'dsh-user-markdown-body' },
      blocks.map((block, index) => {
        switch (block.type) {
          case 'code':
            return React.createElement('pre', { key: index, className: 'dsh-user-code-block' },
              block.lang ? React.createElement('div', { className: 'dsh-user-code-lang' }, block.lang) : null,
              React.createElement('code', null, block.code)
            );
          case 'heading': {
            const tag = 'h' + block.level;
            return React.createElement(tag, { key: index, className: 'dsh-user-h' + block.level },
              renderInline(block.text, referenceLabels)
            );
          }
          case 'hr':
            return React.createElement('hr', { key: index, className: 'dsh-user-hr' });
          case 'blockquote':
            return React.createElement('blockquote', { key: index, className: 'dsh-user-blockquote' },
              renderInline(block.text, referenceLabels)
            );
          case 'ul':
            return React.createElement('ul', { key: index, className: 'dsh-user-ul' },
              block.items.map((item, itemIdx) =>
                React.createElement('li', { key: itemIdx }, renderInline(item, referenceLabels))
              )
            );
          case 'ol':
            return React.createElement('ol', { key: index, className: 'dsh-user-ol' },
              block.items.map((item, itemIdx) =>
                React.createElement('li', { key: itemIdx }, renderInline(item, referenceLabels))
              )
            );
          case 'table':
            return React.createElement('table', { key: index, className: 'dsh-user-table' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  block.headers.map((h, hIdx) =>
                    React.createElement('th', { key: hIdx }, renderInline(h, referenceLabels))
                  )
                )
              ),
              React.createElement('tbody', null,
                block.rows.map((r, rIdx) =>
                  React.createElement('tr', { key: rIdx },
                    r.map((cell, cIdx) =>
                      React.createElement('td', { key: cIdx }, renderInline(cell, referenceLabels))
                    )
                  )
                )
              )
            );
          case 'p':
          default:
            return React.createElement('p', { key: index, className: 'dsh-user-p' },
              renderInline(block.text, referenceLabels)
            );
        }
      })
    );
  }

  function UserMarkdownMessageNodeView(props) {
    const node = props ? props.node : null;
    const data = node ? node.data : {};
    const content = data ? data.content : [];
    const referenceLabels = data ? data.referenceLabels : [];
    const parts = contentParts(content);
    const text = parts.text;
    const images = parts.images;
    const rest = parts.rest;
    const renderMessageImages = props ? props.renderMessageImages : null;

    const showBubble = text !== '' || (rest && rest.length > 0);

    const [copied, setCopied] = React.useState(false);
    const handleCopy = React.useCallback(function() {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          setCopied(true);
          setTimeout(function() { setCopied(false); }, 2000);
        });
      }
    }, [text]);

    return React.createElement('div', {
      className: 'dsh-user-msg-row',
      'data-time-hover-root': true
    }, [
      React.createElement('div', {
        key: 'stack',
        className: 'dsh-user-msg-stack'
      }, [
        renderMessageImages ? renderMessageImages({ images: images, align: 'end' }) : null,
        showBubble ? React.createElement('div', {
          key: 'bubble',
          className: 'dsh-user-msg-bubble'
        }, [
          React.createElement(UserMarkdownRenderer, {
            key: 'md',
            text: text,
            referenceLabels: referenceLabels
          }),
          rest && rest.length > 0 ? rest.map(function(block, i) {
            return React.createElement('pre', { key: 'rest-' + i, className: 'dsh-user-rest-block' },
              JSON.stringify(block, null, 2)
            );
          }) : null
        ]) : null,
        referenceLabels && referenceLabels.length > 0 ? React.createElement('div', {
          key: 'ref-summary',
          className: 'dsh-user-ref-summary'
        }, referenceLabels.join(', ')) : null
      ]),
      React.createElement('div', {
        key: 'actions',
        className: 'dsh-user-msg-actions'
      }, [
        React.createElement('button', {
          key: 'copy',
          type: 'button',
          onClick: handleCopy,
          className: 'dsh-user-copy-btn',
          title: copied ? 'Copied!' : 'Copy message'
        }, copied ? '✓' : '📋')
      ])
    ]);
  }

  slots.inject('conversation.chat.node', () => {
    slots.register({
      name: 'conversation.chat.node',
      key: 'user'
    }, UserMarkdownMessageNodeView);

    slots.register({
      name: 'conversation.chat.node',
      key: 'steering'
    }, UserMarkdownMessageNodeView);
  });
}
