import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Register only the languages used in Drupal development
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import js from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import ts from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'

SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('javascript', js)
SyntaxHighlighter.registerLanguage('js', js)
SyntaxHighlighter.registerLanguage('typescript', ts)
SyntaxHighlighter.registerLanguage('ts', ts)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('sh', bash)
SyntaxHighlighter.registerLanguage('shell', bash)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('yml', yaml)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('html', markup)
SyntaxHighlighter.registerLanguage('xml', markup)
SyntaxHighlighter.registerLanguage('sql', sql)

const CODE_BG = '#0d1117' // slightly lighter than navy-900 to give depth

// Shared SyntaxHighlighter style override to fit our theme
const codeStyle: React.CSSProperties = {
  margin: 0,
  borderRadius: '6px',
  fontSize: '12px',
  lineHeight: '1.5',
  background: CODE_BG,
  padding: '12px',
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Block code: react-markdown v10 wraps <code> in <pre> for fenced blocks.
        // We intercept at <pre> level to pass the language to SyntaxHighlighter.
        pre({ children }) {
          const child = React.Children.toArray(children)[0] as React.ReactElement<{
            className?: string
            children?: React.ReactNode
          }>
          if (!child) return <pre>{children}</pre>

          const className = child.props.className ?? ''
          const match = /language-(\w+)/.exec(className)
          const language = match?.[1] ?? 'text'
          const code = String(child.props.children ?? '').replace(/\n$/, '')

          return (
            <div className="my-3 rounded-md overflow-hidden border border-navy-600">
              {match && (
                <div className="flex items-center justify-between px-3 py-1 bg-navy-700 border-b border-navy-600">
                  <span className="text-[10px] text-navy-300 font-mono">{language}</span>
                </div>
              )}
              <SyntaxHighlighter
                language={language}
                style={vscDarkPlus}
                customStyle={codeStyle}
                PreTag="div"
                useInlineStyles
              >
                {code}
              </SyntaxHighlighter>
            </div>
          )
        },

        // Inline code
        code({ className, children }) {
          // If className is present it's a block handled by <pre> above; render plain
          if (className) return <code className={className}>{children}</code>
          return (
            <code className="bg-navy-800 text-ai-teal text-[11px] px-1.5 py-0.5 rounded font-mono border border-navy-600">
              {children}
            </code>
          )
        },

        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
        },

        h1({ children }) {
          return <h1 className="text-base font-semibold text-gray-100 mb-2 mt-3 first:mt-0">{children}</h1>
        },
        h2({ children }) {
          return <h2 className="text-sm font-semibold text-gray-100 mb-1.5 mt-3 first:mt-0">{children}</h2>
        },
        h3({ children }) {
          return <h3 className="text-xs font-semibold text-gray-200 mb-1 mt-2 first:mt-0">{children}</h3>
        },

        ul({ children }) {
          return <ul className="list-disc list-outside ml-4 mb-2 space-y-0.5">{children}</ul>
        },
        ol({ children }) {
          return <ol className="list-decimal list-outside ml-4 mb-2 space-y-0.5">{children}</ol>
        },
        li({ children }) {
          return <li className="text-sm leading-relaxed">{children}</li>
        },

        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-ai-teal pl-3 my-2 text-navy-300 italic">
              {children}
            </blockquote>
          )
        },

        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-drupal-blue-light hover:underline"
            >
              {children}
            </a>
          )
        },

        table({ children }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse border border-navy-600">{children}</table>
            </div>
          )
        },
        thead({ children }) {
          return <thead className="bg-navy-700">{children}</thead>
        },
        th({ children }) {
          return <th className="px-3 py-1.5 text-left font-medium text-gray-300 border border-navy-600">{children}</th>
        },
        td({ children }) {
          return <td className="px-3 py-1.5 text-gray-400 border border-navy-600">{children}</td>
        },

        hr() {
          return <hr className="my-3 border-navy-500" />
        },

        strong({ children }) {
          return <strong className="font-semibold text-gray-100">{children}</strong>
        },
        em({ children }) {
          return <em className="italic text-gray-300">{children}</em>
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
