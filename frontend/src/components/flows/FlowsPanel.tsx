import { useState } from 'react'
import { Plus, Zap, Puzzle } from 'lucide-react'
import { useFlows } from '@/hooks/useFlows'
import { FlowList } from './FlowList'
import { FlowEditor } from './FlowEditor'
import { McpManager } from './McpManager'
import type { Flow } from '@/api/flows'

type SubTab = 'flows' | 'mcp'

export function FlowsPanel() {
  const [subTab, setSubTab] = useState<SubTab>('flows')
  const [editing, setEditing] = useState<Flow | null | 'new'>(null)

  const { flows, loading, runningFlowId, runError, saveFlow, removeFlow, runFlow } = useFlows()

  return (
    <div className="h-full flex flex-col bg-navy-900">
      {/* Sub-tab bar */}
      <div className="flex items-center border-b border-navy-500 flex-shrink-0 px-4 pt-3">
        <div className="flex gap-1">
          {([
            { id: 'flows' as SubTab, label: 'Flows', icon: Zap },
            { id: 'mcp' as SubTab, label: 'MCPs', icon: Puzzle },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-lg border-b-2 transition-colors ${
                subTab === id
                  ? 'border-ai-teal text-ai-teal bg-navy-800'
                  : 'border-transparent text-navy-400 hover:text-gray-300'
              }`}
            >
              <Icon size={12} />
              {label}
              {id === 'flows' && flows.length > 0 && (
                <span className="text-[9px] bg-navy-600 text-navy-300 px-1.5 rounded-full">{flows.length}</span>
              )}
            </button>
          ))}
        </div>

        {subTab === 'flows' && (
          <button
            onClick={() => setEditing('new')}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs bg-drupal-blue hover:bg-drupal-blue-light text-white rounded-lg transition-colors mb-1"
          >
            <Plus size={12} /> Novo flow
          </button>
        )}
      </div>

      {/* Error banner */}
      {runError && (
        <div className="px-4 py-2 bg-accent-red/10 border-b border-accent-red/20 text-xs text-accent-red flex-shrink-0">
          Erro ao executar flow: {runError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {subTab === 'flows' ? (
          loading ? (
            <div className="flex items-center justify-center h-full text-navy-400 text-xs">A carregar...</div>
          ) : (
            <div className="h-full overflow-y-auto">
              <FlowList
                flows={flows}
                runningFlowId={runningFlowId}
                onEdit={(flow) => setEditing(flow)}
                onDelete={removeFlow}
                onRun={runFlow}
              />
            </div>
          )
        ) : (
          <McpManager />
        )}
      </div>

      {/* Flow editor modal */}
      {editing && (
        <FlowEditor
          initial={editing === 'new' ? undefined : editing}
          onSave={saveFlow}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
