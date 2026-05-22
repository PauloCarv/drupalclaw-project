import { Wrench, Info, AlertCircle, Check, X, Brain } from 'lucide-react'
import { useChatStore, type ActivityItem } from '@/stores/chatStore'

function ItemIcon({ item }: { item: ActivityItem }) {
  if (item.type === 'error') return <AlertCircle size={9} className="text-accent-red flex-shrink-0" />
  if (item.type === 'intent') return <Info size={9} className="text-drupal-blue-light flex-shrink-0" />
  return <Wrench size={9} className="text-navy-400 flex-shrink-0" />
}

function StatusDot({ status }: { status: ActivityItem['status'] }) {
  if (status === 'working') return <span className="w-1.5 h-1.5 rounded-full bg-ai-teal animate-pulse flex-shrink-0" />
  if (status === 'done') return <Check size={9} className="text-accent-green flex-shrink-0" />
  if (status === 'failed') return <X size={9} className="text-accent-red flex-shrink-0" />
  return <span className="w-1.5 h-1.5 rounded-full bg-drupal-blue-light flex-shrink-0" />
}

export function LiveActivity() {
  const { isAgentRunning, isStreaming, agentActivity } = useChatStore()
  const { thought, draft, items } = agentActivity

  // Only render when there's something meaningful to show
  const hasContent = thought || draft || items.length > 0
  if (!(isAgentRunning || isStreaming) || !hasContent) return null

  return (
    <div className="flex justify-end px-2 mb-1">
    <div className="w-[62%] rounded-lg border border-navy-600 bg-navy-800/60 overflow-hidden text-[9px]">
      {/* Thought — single truncated line */}
      {thought && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-navy-700">
          <Brain size={9} className="text-navy-400 flex-shrink-0" />
          <span className="text-navy-400 italic truncate">{thought}</span>
        </div>
      )}

      {/* Tool call feed — compact rows */}
      {items.length > 0 && (
        <div className="divide-y divide-navy-700/50">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 px-2.5 py-1">
              <ItemIcon item={item} />
              <span className={`flex-1 truncate ${item.status === 'failed' ? 'text-accent-red/70' : 'text-navy-300'}`}>
                {item.title}
              </span>
              <StatusDot status={item.status} />
            </div>
          ))}
        </div>
      )}

      {/* Draft preview — single truncated line */}
      {draft && (
        <div className={`px-2.5 py-1.5 text-navy-400 truncate ${items.length > 0 || thought ? 'border-t border-navy-700' : ''}`}>
          {draft}
        </div>
      )}
    </div>
    </div>
  )
}
