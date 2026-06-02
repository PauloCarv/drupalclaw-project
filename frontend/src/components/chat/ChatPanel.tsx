import { useState, useRef, useEffect, useCallback, Fragment } from 'react'
import {
  Send, Square, X, Loader2, Paperclip, FileText, ImageIcon,
  Check, AlertCircle, RotateCw, ClipboardList,
} from 'lucide-react'
import drupalclawIcon from '@/assets/icon.png'
import { useQuery } from '@tanstack/react-query'
import { useChat } from '@/hooks/useChat'
import { useChatStore } from '@/stores/chatStore'
import { useSession } from '@/hooks/useSession'
import { OobeSetup } from '@/components/oobe/OobeSetup'
import { MarkdownContent, PlanSaveCard, extractPlans, stripPlans } from './MarkdownContent'
import { LiveActivity } from './LiveActivity'
import { getAllCommands, type Skill } from '@/api/skills'
import { uploadMedia, type MediaUpload } from '@/api/chat'

const LOGIN_COMMANDS = ['/login', '/provider', '/providers', '/setup']

type MsgStatus = 'processing' | 'confirmed' | 'error'

interface Attachment {
  file: File
  preview?: string
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  if (isYesterday) return `ontem ${time}`
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) + ' ' + time
}

export function ChatPanel() {
  const [input, setInput] = useState('')
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [failedMsgs, setFailedMsgs] = useState<Map<string, string>>(new Map())
  const [planMode, setPlanMode] = useState(false)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prevAssistantCountRef = useRef(0)
  const programmaticScrollRef = useRef(false)

  const { messages: allMessages, isStreaming, isAgentRunning, streamingContent, streamingStartedAt, sendMessage, cancelStreaming } = useChat()
  const { activeSession, currentSession, isCurrentSession, getSessionBounds, switchSession } = useSession()

  // Filter messages to the active session's boundaries.
  // Local optimistic messages (local-*) only show in the current (live) session.
  const isAuthMessage = (m: { role: string; content: string }) =>
    m.role === 'user' && m.content.startsWith('/login')

  const messages = (activeSession
    ? (() => {
        const { start, end } = getSessionBounds(activeSession)
        return allMessages.filter((m) => {
          if (m.id.startsWith('local-')) return isCurrentSession
          const id = Number(m.id)
          if (isNaN(id)) return true
          if (id < start) return false
          if (end !== undefined && id >= end) return false
          return true
        })
      })()
    : allMessages
  ).filter(m => !isAuthMessage(m))

  const { data: allCommands = [] } = useQuery({
    queryKey: ['commands'],
    queryFn: getAllCommands,
    staleTime: 60000,
  })

  const showSuggestions = input.startsWith('/') && !isStreaming
  const suggestions: Skill[] = showSuggestions
    ? allCommands.filter((c) => c.name.toLowerCase().includes(input.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    if (sessionStorage.getItem('dc_send_welcome') !== '1') return
    sessionStorage.removeItem('dc_send_welcome')
    // Send via useChat.sendMessage so isAgentRunning is set and thinking indicator shows
    const timer = setTimeout(() => { sendMessage('Hello! I just set up DrupalClaw.') }, 800)
    return () => clearTimeout(timer)
  }, [sendMessage])

  useEffect(() => { setSuggestionIndex(0) }, [input])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const handleMessagesScroll = useCallback(() => {
    if (programmaticScrollRef.current) return
    const el = messagesContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsNearBottom(distFromBottom < 80)
  }, [])

  useEffect(() => {
    const assistantCount = messages.filter(m => m.role === 'assistant').length
    const hasNewAssistantMsg = assistantCount > prevAssistantCountRef.current
    prevAssistantCountRef.current = assistantCount

    if (hasNewAssistantMsg || isNearBottom) {
      programmaticScrollRef.current = true
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => { programmaticScrollRef.current = false }, 800)
      if (hasNewAssistantMsg && !isNearBottom) setIsNearBottom(true)
    }
  }, [messages, streamingContent, isStreaming, isNearBottom])

  const selectSuggestion = useCallback((cmd: string) => {
    setInput(cmd + ' ')
    setSuggestionIndex(0)
    textareaRef.current?.focus()
  }, [])

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return next
    })
  }

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }

  const doSend = useCallback(async (content: string, media: MediaUpload[] = []) => {
    setIsNearBottom(true)
    const result = await sendMessage(content, media)
    if (!result.ok) {
      setFailedMsgs((prev) => new Map([...prev, [result.localId, content]]))
    }
  }, [sendMessage])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if ((!input.trim() && attachments.length === 0) || isStreaming || isAgentRunning || uploading) return
    // If viewing a historical session, switch to the current one before sending
    // so the response appears where the user will see it.
    if (!isCurrentSession && currentSession) switchSession(currentSession.id)

    if (showSuggestions && suggestions.length > 0) {
      const exact = allCommands.find((c) => c.name === input.trim())
      if (!exact) {
        selectSuggestion(suggestions[suggestionIndex]?.name ?? input)
        return
      }
    }

    const trimmed = input.trim()
    if (LOGIN_COMMANDS.some((cmd) => trimmed.toLowerCase() === cmd || trimmed.toLowerCase().startsWith(cmd + ' '))) {
      setInput('')
      setShowLoginDialog(true)
      return
    }

    let mediaUploads: MediaUpload[] = []
    if (attachments.length > 0) {
      setUploading(true)
      try {
        mediaUploads = await Promise.all(attachments.map((a) => uploadMedia(a.file)))
      } catch (err) {
        console.error('Upload failed:', err)
        setUploading(false)
        return
      }
      setUploading(false)
      attachments.forEach((a) => { if (a.preview) URL.revokeObjectURL(a.preview) })
      setAttachments([])
    }

    const rawContent = trimmed || attachments.map((a) => a.file.name).join(', ')
    const content = planMode
      ? `[PLAN MODE] Before executing anything, analyse the request carefully and produce a structured plan using the [PLAN: title]...[/PLAN] format (with ## Context, ## Steps as unchecked checkboxes - [ ], ## Verification as unchecked checkboxes - [ ]). Do NOT execute any steps yet. Do NOT mention file paths or internal storage details. After presenting the plan, ask the user (in Portuguese) whether they want to: save it to Plans, execute it directly, or modify it first.\n\nUser request: ${rawContent}`
      : rawContent
    setInput('')
    await doSend(content, mediaUploads)
  }

  const handleRetry = useCallback(async (id: string, content: string) => {
    setFailedMsgs((prev) => { const m = new Map(prev); m.delete(id); return m })
    await doSend(content)
  }, [doSend])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex((i) => Math.min(i + 1, suggestions.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestionIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions[suggestionIndex]?.name ?? input); return }
      if (e.key === 'Escape') { setInput(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }, [])

  // While the agent is running, the last user message in the list is the one being processed.
  // Status is agent-state-based, not ID-based — local messages get confirmed quickly (<2s)
  // and their ID changes, so checking id.startsWith('local-') is not reliable.
  const lastUserMsgId = isAgentRunning
    ? messages.reduce<string | undefined>((last, m) => m.role === 'user' ? m.id : last, undefined)
    : undefined

  const getMsgStatus = (id: string, role: string): MsgStatus | undefined => {
    if (role !== 'user') return undefined
    if (failedMsgs.has(id)) return 'error'
    if (id === lastUserMsgId) return 'processing'
    return 'confirmed'
  }

  return (
    <div
      className="h-full flex flex-col relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.json,.yaml,.yml,.csv,.log,.sql,.sh,.php,.js,.ts,.tsx,.html,.css,.xml"
        onChange={(e) => addFiles(e.target.files)}
        onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
      />

      {showLoginDialog && (
        <div className="absolute inset-0 z-50 bg-navy-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg">
            <button
              onClick={() => setShowLoginDialog(false)}
              className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-navy-600 border border-navy-500 flex items-center justify-center text-navy-300 hover:text-white hover:bg-navy-500 transition-colors"
            >
              <X size={14} />
            </button>
            <OobeSetup embedded reconfigure onComplete={() => setShowLoginDialog(false)} />
          </div>
        </div>
      )}

      {activeSession && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-navy-500 flex-shrink-0">
          <span className="text-[10px] text-navy-400 truncate flex-1">{activeSession.name}</span>
          {!isCurrentSession && (
            <span className="text-[10px] text-navy-400">history</span>
          )}
        </div>
      )}

      {(isStreaming || isAgentRunning) && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-navy-800 border-b border-ai-teal/20 text-xs text-ai-teal flex-shrink-0">
          <Loader2 size={11} className="animate-spin flex-shrink-0" />
          <span>
            {streamingContent
              ? 'Receiving response...'
              : isStreaming
                ? 'Processing...'
                : 'Continuing to process...'}
          </span>
          {(isStreaming || isAgentRunning) && (
            <button onClick={cancelStreaming} className="ml-auto text-navy-300 hover:text-accent-red transition-colors flex items-center gap-1" title="Abort the response and any running commands">
              <Square size={10} />
              <span>Stop</span>
            </button>
          )}
        </div>
      )}

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4"
        onScroll={handleMessagesScroll}
      >
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-drupal-blue flex items-center justify-center text-lg font-bold text-white mb-3">DC</div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">Welcome to DrupalClaw</h3>
            <p className="text-xs text-navy-300 max-w-xs">Ask me anything about your Drupal project, or use a skill from the sidebar.</p>
          </div>
        )}

        {(() => {
          // LiveActivity shows below the triggering user message only while there's
          // no assistant response yet. Derive this from messages — no extra state.
          const hasResponseAfterStart = streamingStartedAt != null &&
            messages.some(m => m.role === 'assistant' && m.timestamp >= streamingStartedAt)
          const showActivity = !hasResponseAfterStart

          return messages.map((msg) => {
            const status = getMsgStatus(msg.id, msg.role)
            return (
              <Fragment key={msg.id}>
                <MessageBubble
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                  status={status}
                  onCancel={status === 'processing' ? cancelStreaming : undefined}
                  onRetry={status !== 'processing' ? () => handleRetry(msg.id, msg.content) : undefined}
                  onChoice={msg.role === 'assistant' ? (c) => doSend(c) : undefined}
                />
                {showActivity && msg.id === lastUserMsgId && <LiveActivity />}
              </Fragment>
            )
          })
        })()}

        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} streaming />
        )}

        <div ref={messagesEndRef} />
      </div>


      <form onSubmit={handleSubmit} className="p-3 border-t border-navy-500 flex-shrink-0 relative">
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-navy-700 border border-navy-500 rounded-lg shadow-lg overflow-hidden z-10">
            {suggestions.map((cmd, i) => (
              <button
                key={cmd.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(cmd.name) }}
                className={`w-full flex items-start gap-3 px-3 py-2 text-left transition-colors ${i === suggestionIndex ? 'bg-navy-600' : 'hover:bg-navy-600'}`}
              >
                <span className="text-xs font-mono text-ai-teal flex-shrink-0 mt-0.5">{cmd.name}</span>
                <span className="text-[10px] text-navy-300 truncate">{cmd.description}</span>
              </button>
            ))}
            <div className="px-3 py-1 border-t border-navy-600 flex gap-3 text-[9px] text-navy-400">
              <span>↑↓ navigate</span><span>Tab select</span><span>Esc close</span>
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group flex items-center gap-1.5 bg-navy-600 border border-navy-500 rounded-lg px-2 py-1 text-xs text-gray-300">
                {att.preview
                  ? <img src={att.preview} alt="" className="w-8 h-8 object-cover rounded" />
                  : <FileText size={14} className="text-navy-300 flex-shrink-0" />
                }
                <span className="max-w-[120px] truncate">{att.file.name}</span>
                <button type="button" onClick={() => removeAttachment(i)} className="ml-1 text-navy-400 hover:text-accent-red transition-colors">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex items-end gap-2 rounded-lg px-3 py-2 transition-colors ${(isStreaming || isAgentRunning) ? 'bg-navy-700 opacity-60' : 'bg-navy-600'}`}>
          <button
            type="button"
            disabled={isStreaming || isAgentRunning}
            onClick={() => fileInputRef.current?.click()}
            className="text-navy-300 hover:text-ai-teal p-0.5 flex-shrink-0 transition-colors"
            title="Attach file"
          >
            <Paperclip size={14} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={(isStreaming || isAgentRunning) ? 'Waiting for response...' : 'Ask anything or / for commands... (Shift+Enter for new line)'}
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-navy-400 outline-none resize-none leading-relaxed"
            style={{ minHeight: '22px', maxHeight: '160px' }}
            rows={1}
            disabled={isStreaming || isAgentRunning}
          />

          {(isStreaming || isAgentRunning) ? (
            <button type="button" onClick={cancelStreaming} className="text-accent-red hover:text-red-400 flex-shrink-0" title="Stop agent and running processes">
              <Square size={16} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={(!input.trim() && attachments.length === 0) || uploading}
              className="text-ai-teal hover:text-ai-teal-light disabled:text-navy-400 flex-shrink-0 transition-colors"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2 pl-0.5">
          <button
            type="button"
            disabled={isStreaming || isAgentRunning}
            onClick={() => setPlanMode((v) => !v)}
            title={planMode ? 'Plan mode active — click to disable' : 'Plan mode — agent plans before executing'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors disabled:opacity-40 ${
              planMode
                ? 'bg-ai-teal/15 border-ai-teal/50 text-ai-teal'
                : 'bg-transparent border-navy-500 text-navy-400 hover:border-navy-400 hover:text-navy-300'
            }`}
          >
            <ClipboardList size={10} />
            Plan
          </button>
          <p className="text-[9px] text-navy-400">
            Enter to send · Shift+Enter for new line · drag files to attach
          </p>
        </div>
      </form>
    </div>
  )
}

const ATTACH_BLOCK_RE = /\n\nAttachments:\n((?:- attachment:\d+ \([^)]+\)\n?)+)$/

function parseContent(raw: string): { text: string; files: string[] } {
  const match = raw.match(ATTACH_BLOCK_RE)
  if (!match) return { text: raw, files: [] }
  const text = raw.slice(0, raw.length - match[0].length)
  const files = match[1].trim().split('\n').map(l => {
    const m = l.match(/- attachment:\d+ \(([^)]+)\)/)
    return m ? m[1] : null
  }).filter(Boolean) as string[]
  return { text, files }
}

function isImageFilename(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(name)
}

function StatusIcon({ status }: { status: MsgStatus }) {
  if (status === 'processing') return <Loader2 size={10} className="text-ai-teal animate-spin" />
  if (status === 'confirmed') return <Check size={10} className="text-accent-green/70" />
  if (status === 'error') return <AlertCircle size={10} className="text-accent-red" />
  return null
}

function MessageBubble({
  role, content, streaming = false, timestamp, status, onCancel, onRetry, onChoice,
}: {
  role: string; content: string; streaming?: boolean
  timestamp?: number; status?: MsgStatus
  onCancel?: () => void; onRetry?: () => void; onChoice?: (c: string) => void
}) {
  const isUser = role === 'user'
  const userName = useChatStore((s) => s.userName)
  const userInitials = userName
    ? userName.split(/[\s._-]+/).map((p) => p[0]?.toUpperCase() ?? '').filter(Boolean).slice(0, 2).join('')
    : 'You'
  const { text: rawText, files } = parseContent(content)
  // Strip the internal plan-mode instruction prefix — show only the user's actual request
  const planModeMatch = rawText.match(/^\[PLAN MODE\][\s\S]*?\nUser request:\s*([\s\S]+)$/)
  const text = planModeMatch ? `[Plan mode] ${planModeMatch[1].trim()}` : rawText

  // Extract plan cards from assistant messages and render them outside the bubble
  const planCards = (!isUser && !streaming) ? extractPlans(text) : []
  const bubbleText = planCards.length > 0 ? stripPlans(text) : text

  return (
    <div className={`group flex gap-2 ${isUser ? 'justify-end' : 'items-start'}`}>
      {!isUser && (
        <img src={drupalclawIcon} alt="DrupalClaw" className="w-7 h-7 rounded-full object-contain flex-shrink-0 mt-0.5" />
      )}
      <div className={`flex flex-col gap-0.5 ${isUser ? 'items-end' : 'items-start'} max-w-[80%] min-w-0`}>
        {(bubbleText || files.length > 0) && (
        <div
          className={`rounded-lg px-3 py-2 ${isUser ? 'bg-drupal-blue text-white' : 'bg-navy-600 text-gray-200'} ${streaming ? 'border border-ai-teal/40 animate-pulse' : ''}`}
          style={{ fontSize: 'var(--dc-font-size)' }}
        >
          {bubbleText && (
            isUser || streaming
              ? <pre className="whitespace-pre-wrap font-sans break-words leading-relaxed">{bubbleText}</pre>
              : <MarkdownContent content={bubbleText} onChoice={onChoice} />
          )}
          {files.length > 0 && (
            <div className={`flex flex-wrap gap-1.5 ${bubbleText ? 'mt-2' : ''}`}>
              {files.map((name, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${isUser ? 'bg-white/15 text-white/80' : 'bg-navy-500 text-navy-200'}`}
                >
                  {isImageFilename(name) ? <ImageIcon size={10} /> : <FileText size={10} />}
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
        )}
        {planCards.map((plan, i) => (
          <div key={i} className="w-full">
            <PlanSaveCard title={plan.title} body={plan.body} />
          </div>
        ))}

        {/* Meta row: actions + timestamp + status */}
        <div className="flex items-center gap-1.5 px-1">
          {isUser && onRetry && (
            <button
              onClick={onRetry}
              className="text-navy-400 hover:text-ai-teal transition-colors"
              title="Retry"
            >
              <RotateCw size={10} />
            </button>
          )}
          {isUser && onCancel && (
            <button
              onClick={onCancel}
              className="text-navy-400 hover:text-accent-red transition-colors"
              title="Cancel"
            >
              <X size={10} />
            </button>
          )}
          {timestamp && (
            <span className="text-[10px] text-navy-400">{formatTimestamp(timestamp)}</span>
          )}
          {isUser && status && <StatusIcon status={status} />}
        </div>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-navy-500 flex items-center justify-center text-[10px] text-drupal-blue-light flex-shrink-0 font-medium mt-0.5">{userInitials}</div>
      )}
    </div>
  )
}
