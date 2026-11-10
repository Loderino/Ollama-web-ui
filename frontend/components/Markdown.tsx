"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors bg-neutral-800/80 px-2 py-1 rounded backdrop-blur-sm"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          Скопировано
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Копировать
        </>
      )}
    </button>
  );
}

export default function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        a: ({ node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" />
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
        hr: () => <hr className="border-neutral-800 my-6" />,
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm text-left border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-neutral-800/50 text-neutral-300">{children}</thead>,
        th: ({ children }) => <th className="border border-neutral-700 px-4 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-neutral-700 px-4 py-2">{children}</td>,
        del: ({ children }) => <del className="line-through text-neutral-500">{children}</del>,
        ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-4">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-4">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold mb-2 mt-3">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-bold mb-2 mt-2">{children}</h4>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-neutral-600 pl-4 py-1 my-3 text-neutral-400 italic">
            {children}
          </blockquote>
        ),
        pre: ({ children, ...props }) => {
          const extractText = (node: any): string => {
            if (typeof node === "string") return node;
            if (Array.isArray(node)) return node.map(extractText).join("");
            if (node?.props?.children) return extractText(node.props.children);
            return "";
          };
          const codeText = extractText(children);

          return (
            <div className="relative my-4 rounded-lg overflow-hidden border border-neutral-800 bg-[#0d0d0d]">
              <div className="absolute top-2 right-2 z-10">
                <CopyButton text={codeText} />
              </div>
              <div className="overflow-x-auto p-4 text-sm">
                <pre {...props}>{children}</pre>
              </div>
            </div>
          );
        },
        code: ({ node, className, children, ...props }) => {
          return (
            <code className={`${className || ""} bg-neutral-800 rounded px-1.5 py-0.5 text-sm text-neutral-200`} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
