"use client";

import { Fragment, type ReactNode } from "react";
import { CodeBlock } from "@aisdkpro/ui";

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${partIndex++}`;
    if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**") && token.endsWith("**")) {
      tokens.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      tokens.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      if (isSafeHref(href)) {
        const external = href.startsWith("http");
        tokens.push(
          <a
            key={key}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
          >
            {label}
          </a>
        );
      } else {
        tokens.push(<span key={key}>{label}</span>);
      }
    } else {
      tokens.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

function renderMarkdownBlocks(markdown: string, blockPrefix: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  let i = 0;
  let blockIndex = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2], `${blockPrefix}-h-${blockIndex}`);
      const key = `${blockPrefix}-b-${blockIndex++}`;
      if (level <= 2) nodes.push(<h2 key={key}>{content}</h2>);
      else nodes.push(<h3 key={key}>{content}</h3>);
      i += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i += 1;
      }
      nodes.push(
        <blockquote key={`${blockPrefix}-b-${blockIndex++}`}>
          {renderInline(quoteLines.join(" "), `${blockPrefix}-q-${blockIndex}`)}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, "");
        items.push(
          <li key={`${blockPrefix}-li-${i}`}>
            {renderInline(itemText, `${blockPrefix}-uli-${i}`)}
          </li>
        );
        i += 1;
      }
      nodes.push(<ul key={`${blockPrefix}-b-${blockIndex++}`}>{items}</ul>);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(
          <li key={`${blockPrefix}-oli-${i}`}>
            {renderInline(itemText, `${blockPrefix}-oli-t-${i}`)}
          </li>
        );
        i += 1;
      }
      nodes.push(<ol key={`${blockPrefix}-b-${blockIndex++}`}>{items}</ol>);
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ") &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    nodes.push(
      <p key={`${blockPrefix}-b-${blockIndex++}`}>
        {renderInline(paragraphLines.join(" "), `${blockPrefix}-p-${blockIndex}`)}
      </p>
    );
  }

  return nodes;
}

export function LazyStreamdown({ children }: { children: string }) {
  if (!children) return null;

  const segments: ReactNode[] = [];
  const fenceRegex = /```([^\n]*)\n([\s\S]*?)(?:```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let segmentIndex = 0;

  while ((match = fenceRegex.exec(children)) !== null) {
    if (match.index > lastIndex) {
      const prose = children.slice(lastIndex, match.index);
      segments.push(
        <Fragment key={`prose-${segmentIndex}`}>
          {renderMarkdownBlocks(prose, `seg-${segmentIndex}`)}
        </Fragment>
      );
      segmentIndex += 1;
    }

    const header = match[1].trim();
    const language = header.split(/\s+/)[0] || "text";
    const filename = header.match(/filename=(\S+)/)?.[1];
    const code = match[2].replace(/\n$/, "");

    segments.push(
      <CodeBlock
        key={`code-${segmentIndex}`}
        code={code}
        language={language}
        filename={filename}
      />
    );
    segmentIndex += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < children.length) {
    const trailing = children.slice(lastIndex);
    segments.push(
      <Fragment key={`prose-${segmentIndex}`}>
        {renderMarkdownBlocks(trailing, `seg-${segmentIndex}`)}
      </Fragment>
    );
  }

  return <>{segments}</>;
}
