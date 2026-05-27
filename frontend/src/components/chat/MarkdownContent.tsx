import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ClipboardPlus, Loader2, Check } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { createPlan } from '@/api/plans'
import { usePlansStore } from '@/stores/plansStore'
import { useLayoutStore } from '@/stores/layoutStore'
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

type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'pick'; options: string[] }
  | { type: 'plan'; title: string; body: string }

function stripDidacticBlock(content: string): string {
  // Remove the 💡 How to replicate manually block (from marker to "Want..." line)
  return content.replace(/\n?💡 \*\*How to replicate manually:\*\*[\s\S]*?Want [^\n]*(\n|$)/g, '\n').trimEnd()
}

function splitOnPlanAndPick(content: string): ContentPart[] {
  // First split on [PLAN: title]...[/PLAN] blocks
  const planRe = /\[PLAN:\s*([^\]]+)\]([\s\S]*?)\[\/PLAN\]/g
  const parts: ContentPart[] = []
  let lastIndex = 0
  for (const match of content.matchAll(planRe)) {
    if (match.index! > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'plan', title: match[1].trim(), body: match[2].trim() })
    lastIndex = match.index! + match[0].length
  }
  if (lastIndex < content.length) parts.push({ type: 'text', value: content.slice(lastIndex) })
  // Then split text parts further on PICK
  return parts.flatMap((p) => p.type === 'text' ? splitOnPick(p.value) : [p])
}

function PlanSaveCard({ title, body }: { title: string; body: string }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { loadPlans, selectPlan, addOrUpdateSummary } = usePlansStore()
  const { setMainTab } = useLayoutStore()

  const handleSave = async () => {
    if (saving || saved) return
    setSaving(true)
    try {
      const steps = (body.match(/^- \[[ x]\] .+/gm) ?? []).map((l) => l.replace(/^- \[[ x]\] /, ''))
      const id = await createPlan({ title, source: 'chat', context: body, steps })
      const now = new Date().toISOString()
      addOrUpdateSummary({ id, title, status: 'draft', source: 'chat', created: now, updated: now })
      setMainTab('plans')
      setSaved(true)
      await selectPlan(id)
      setTimeout(() => loadPlans(), 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="my-2 p-3 rounded-lg border border-ai-teal/30 bg-ai-teal/5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-ai-teal truncate">Plan: {title}</p>
        <p className="text-[10px] text-navy-400 truncate">
          {body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? 'Save to Plans tab'}
        </p>
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || saved}
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-ai-teal/50 text-ai-teal rounded hover:bg-ai-teal/10 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 size={10} className="animate-spin" /> : saved ? <Check size={10} /> : <ClipboardPlus size={10} />}
        {saved ? 'Saved' : 'Save plan'}
      </button>
    </div>
  )
}

function splitOnPick(content: string): ContentPart[] {
  const parts: ContentPart[] = []
  const re = /\[PICK:\s*([^\]]+)\]/g
  let lastIndex = 0
  for (const match of content.matchAll(re)) {
    if (match.index! > lastIndex) parts.push({ type: 'text', value: content.slice(lastIndex, match.index) })
    const options = match[1].split('|').map((o) => o.trim()).filter(Boolean)
    parts.push({ type: 'pick', options })
    lastIndex = match.index! + match[0].length
  }
  if (lastIndex < content.length) parts.push({ type: 'text', value: content.slice(lastIndex) })
  return parts
}

function PickWidget({ options, onChoice }: { options: string[]; onChoice?: (c: string) => void }) {
  const { isStreaming, isAgentRunning } = useChatStore()
  const disabled = isStreaming || isAgentRunning || !onChoice
  return (
    <div className="flex flex-wrap gap-2 my-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          disabled={disabled}
          onClick={() => onChoice?.(opt)}
          className="px-3 py-1.5 rounded-md text-xs border border-drupal-blue text-drupal-blue-light hover:bg-drupal-blue/20 active:bg-drupal-blue/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

// Shared SyntaxHighlighter style override to fit our theme
const codeStyle: React.CSSProperties = {
  margin: 0,
  borderRadius: '6px',
  fontSize: '12px',
  lineHeight: '1.5',
  background: CODE_BG,
  padding: '12px',
}

export function MarkdownContent({ content, onChoice }: { content: string; onChoice?: (c: string) => void }) {
  const interactionMode = useSettingsStore((s) => s.interactionMode)
  const processedContent = interactionMode === 'expert' ? stripDidacticBlock(content) : content
  const parts = splitOnPlanAndPick(processedContent)
  if (parts.length === 1 && parts[0].type === 'text') {
    return <ReactMarkdownBlock content={processedContent} />
  }
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'pick') return <PickWidget key={i} options={part.options} onChoice={onChoice} />
        if (part.type === 'plan') return <PlanSaveCard key={i} title={part.title} body={part.body} />
        return part.value.trim() ? <ReactMarkdownBlock key={i} content={part.value} /> : null
      })}
    </>
  )
}

function ReactMarkdownBlock({ content }: { content: string }) {
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
