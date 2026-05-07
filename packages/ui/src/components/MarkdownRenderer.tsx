import { useDeferredValue, useMemo, useState, useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Highlight, themes } from "prism-react-renderer";

interface Props {
  content: string;
  isStreaming?: boolean;
}

// 常见语言别名映射
const langMap: Record<string, string> = {
  js: "javascript", ts: "typescript", tsx: "tsx", jsx: "jsx",
  py: "python", rb: "ruby", sh: "bash", shell: "bash",
  yml: "yaml", md: "markdown", json: "json", css: "css",
  html: "html", sql: "sql", go: "go", rs: "rust",
  java: "java", cpp: "cpp", c: "c", kt: "kotlin",
  scala: "scala", swift: "swift", r: "r", dart: "dart",
};

function mapLang(lang: string): string {
  return langMap[lang] ?? lang;
}

// 检测 streaming 时是否有未关闭的代码围栏
function hasUnclosedFence(text: string): boolean {
  let count = 0;
  for (const line of text.split("\n")) {
    if (/^```/.test(line.trim())) count++;
  }
  return count % 2 !== 0;
}

// ========== 自定义元素组件 ==========

function Heading({ level, children, ...props }: { level: 1 | 2 | 3 | 4 | 5 | 6; children?: ReactNode } & Record<string, unknown>) {
  const cls: Record<number, string> = {
    1: "text-xl font-bold mt-4 mb-2 pb-1 border-b border-[var(--border)]",
    2: "text-lg font-semibold mt-3 mb-1.5",
    3: "text-base font-semibold mt-2.5 mb-1",
    4: "text-sm font-semibold mt-2 mb-1",
    5: "text-sm font-medium mt-2 mb-0.5",
    6: "text-xs font-medium mt-2 mb-0.5 text-[var(--text-muted)]",
  };
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return <Tag className={cls[level]} {...props}>{children}</Tag>;
}

function Paragraph({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <p className="mb-2 last:mb-0 leading-relaxed" {...props}>{children}</p>;
}

function InlineCode({ children, className, ...props }: { children?: ReactNode; className?: string } & Record<string, unknown>) {
  if (className?.startsWith("language-")) {
    return <code className={className} {...props}>{children}</code>;
  }
  return (
    <code className="bg-[var(--border)]/40 text-[var(--primary)] px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
      {children}
    </code>
  );
}

// 代码块组件（带高亮 + 语言标签 + 复制按钮）
function CodeBlock({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  const codeProps = (children as { props?: Record<string, unknown> } | undefined)?.props;
  const code = codeProps?.children as string | undefined;
  const language = ((codeProps?.className as string) ?? "").replace("language-", "");

  if (!code) return <pre {...props}>{children}</pre>;

  return <CodeBlockHighlight code={code} language={language} />;
}

function CodeBlockHighlight({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const prismLang = mapLang(language) || "text";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--sidebar)]">
      <div className="flex items-center justify-between px-3 py-1 bg-[var(--border)]/30 border-b border-[var(--border)]">
        <span className="text-xs text-[var(--text-muted)] font-mono">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <Highlight theme={themes.oneDark} code={code.trimEnd()} language={prismLang}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{ ...style, backgroundColor: "transparent" }}
            className="p-3 overflow-x-auto text-[13px] leading-relaxed"
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function Link({ href, children, ...props }: { href?: string; children?: ReactNode } & Record<string, unknown>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--primary)] hover:text-[var(--primary-hover)] underline underline-offset-2 transition-colors"
      {...props}
    >
      {children}
    </a>
  );
}

function Strong({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <strong className="font-semibold text-[var(--text)]" {...props}>{children}</strong>;
}

function Em({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <em className="italic text-[var(--text-muted)]" {...props}>{children}</em>;
}

function UnorderedList({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <ul className="list-disc list-outside ml-5 mb-2 space-y-0.5" {...props}>{children}</ul>;
}

function OrderedList({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <ol className="list-decimal list-outside ml-5 mb-2 space-y-0.5" {...props}>{children}</ol>;
}

function ListItem({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <li className="leading-relaxed" {...props}>{children}</li>;
}

function Blockquote({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <blockquote className="border-l-[3px] border-[var(--primary)]/40 pl-3 my-2 text-[var(--text-muted)] italic" {...props}>
      {children}
    </blockquote>
  );
}

function Table({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse border border-[var(--border)] text-sm" {...props}>
        {children}
      </table>
    </div>
  );
}

function TableHead({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <thead className="bg-[var(--border)]/20" {...props}>{children}</thead>;
}

function TableBody({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <tbody {...props}>{children}</tbody>;
}

function TableRow({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <tr className="border-b border-[var(--border)]" {...props}>{children}</tr>;
}

function TableHeader({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <th className="px-3 py-1.5 text-left font-semibold text-[var(--text)] border border-[var(--border)]" {...props}>
      {children}
    </th>
  );
}

function TableCell({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return (
    <td className="px-3 py-1.5 border border-[var(--border)] text-[var(--text)]" {...props}>
      {children}
    </td>
  );
}

function HorizontalRule(props: Record<string, unknown>) {
  return <hr className="my-3 border-[var(--border)]" {...props} />;
}

function Strikethrough({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
  return <del className="line-through text-[var(--text-muted)]" {...props}>{children}</del>;
}

function Image({ src, alt, ...props }: { src?: string; alt?: string } & Record<string, unknown>) {
  return (
    <img
      src={src}
      alt={alt || ""}
      className="max-w-full rounded-lg my-2"
      loading="lazy"
      {...props}
    />
  );
}

// ========== 组装 components 映射 ==========
const components: Record<string, React.ComponentType<Record<string, unknown>>> = {
  h1: (p: Record<string, unknown>) => <Heading level={1} {...p} />,
  h2: (p: Record<string, unknown>) => <Heading level={2} {...p} />,
  h3: (p: Record<string, unknown>) => <Heading level={3} {...p} />,
  h4: (p: Record<string, unknown>) => <Heading level={4} {...p} />,
  h5: (p: Record<string, unknown>) => <Heading level={5} {...p} />,
  h6: (p: Record<string, unknown>) => <Heading level={6} {...p} />,
  p: Paragraph as React.ComponentType<Record<string, unknown>>,
  a: Link as React.ComponentType<Record<string, unknown>>,
  code: InlineCode as React.ComponentType<Record<string, unknown>>,
  pre: CodeBlock as React.ComponentType<Record<string, unknown>>,
  strong: Strong as React.ComponentType<Record<string, unknown>>,
  em: Em as React.ComponentType<Record<string, unknown>>,
  ul: UnorderedList as React.ComponentType<Record<string, unknown>>,
  ol: OrderedList as React.ComponentType<Record<string, unknown>>,
  li: ListItem as React.ComponentType<Record<string, unknown>>,
  blockquote: Blockquote as React.ComponentType<Record<string, unknown>>,
  table: Table as React.ComponentType<Record<string, unknown>>,
  thead: TableHead as React.ComponentType<Record<string, unknown>>,
  tbody: TableBody as React.ComponentType<Record<string, unknown>>,
  tr: TableRow as React.ComponentType<Record<string, unknown>>,
  th: TableHeader as React.ComponentType<Record<string, unknown>>,
  td: TableCell as React.ComponentType<Record<string, unknown>>,
  hr: HorizontalRule as React.ComponentType<Record<string, unknown>>,
  del: Strikethrough as React.ComponentType<Record<string, unknown>>,
  img: Image as React.ComponentType<Record<string, unknown>>,
};

// ========== 主组件 ==========
export function MarkdownRenderer({ content, isStreaming }: Props) {
  const deferredContent = isStreaming ? useDeferredValue(content) : content;

  const renderContent = useMemo(() => {
    if (isStreaming && hasUnclosedFence(deferredContent)) {
      const idx = deferredContent.lastIndexOf("```");
      return deferredContent.substring(0, idx);
    }
    return deferredContent;
  }, [deferredContent, isStreaming]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {renderContent}
    </ReactMarkdown>
  );
}
