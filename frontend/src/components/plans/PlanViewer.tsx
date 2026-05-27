import { useState } from 'react'
import { Play, CheckCircle2, Pencil, Trash2, Loader2, ChevronDown, ChevronRight, RotateCw } from 'lucide-react'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import { deletePlan, savePlan } from '@/api/plans'
import { usePlansStore } from '@/stores/plansStore'
import { useChatStore } from '@/stores/chatStore'
import { postMessage } from '@/api/chat'
import { PlanEditor } from './PlanEditor'
import type { PlanDetail } from '@/api/plans'

function PlanRunningBody({ body }: { body: string }) {
  // Parse sections: everything outside Steps/Verification renders as-is,
  // Steps and Verification get custom rendering with active-step highlight.
  const lines = body.split('\n')
  let activeFound = false

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        const done = /^- \[x\]/i.test(line)
        const pending = /^- \[ \]/.test(line)
        const isActive = pending && !activeFound
        if (isActive) activeFound = true

        if (isActive) {
          return (
            <div key={i} className="flex items-start gap-2 px-2 py-1 rounded-md bg-ai-teal/10 border border-ai-teal/30">
              <Loader2 size={13} className="text-ai-teal animate-spin flex-shrink-0 mt-0.5" />
              <span className="text-ai-teal text-sm font-medium">{line.replace(/^- \[ \] /, '')}</span>
            </div>
          )
        }
        if (done) {
          return (
            <div key={i} className="flex items-start gap-2 px-2 py-1">
              <span className="text-accent-green flex-shrink-0 mt-0.5">✓</span>
              <span className="text-navy-400 text-sm line-through decoration-navy-500">{line.replace(/^- \[x\] /i, '')}</span>
            </div>
          )
        }
        if (pending) {
          return (
            <div key={i} className="flex items-start gap-2 px-2 py-1 opacity-40">
              <span className="text-navy-400 flex-shrink-0 mt-0.5">○</span>
              <span className="text-navy-300 text-sm">{line.replace(/^- \[ \] /, '')}</span>
            </div>
          )
        }
        if (line.startsWith('## ')) {
          return <h3 key={i} className="text-xs font-semibold text-gray-200 mt-4 mb-1 first:mt-0">{line.replace(/^## /, '')}</h3>
        }
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm text-gray-300 px-2">{line}</p>
      })}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-navy-400 border-navy-500',
  ready: 'text-drupal-blue-light border-drupal-blue/50',
  running: 'text-ai-teal border-ai-teal/50 animate-pulse',
  completed: 'text-accent-green border-accent-green/50',
  failed: 'text-accent-red border-accent-red/50',
}

export function PlanViewer({ plan }: { plan: PlanDetail }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRuns, setShowRuns] = useState(false)
  const { runningPlanId, setRunning, removePlan, loadPlans, selectPlan } = usePlansStore()
  // Derive executing/validating from global store — survives tab switches
  const executing = runningPlanId === plan.meta.id
  const validating = false // validate sets runningPlanId too, so 'executing' covers both

  const triggerSkill = async (command: string) => {
    const store = useChatStore.getState()
    const now = Date.now()
    store.setStreamingStartedAt(now)
    store.setStreaming(true)
    store.setAgentRunning(true)
    store.clearActivity()
    await postMessage(command)
  }

  const handleExecute = async () => {
    if (executing) return
    // Reset checkboxes and status so progress is visible on re-runs
    const reset = plan.raw
      .replace(/^- \[x\]/gm, '- [ ]')
      .replace(/^status:\s*.+$/m, 'status: draft')
    await savePlan(plan.meta.id, reset)
    await selectPlan(plan.meta.id)
    setRunning(plan.meta.id)
    await triggerSkill(`/skill:drupal-plan-run ${plan.meta.id}`)
  }

  const handleValidate = async () => {
    if (executing) return
    // Reset verification checkboxes and status so polling doesn't fire immediately
    const reset = plan.raw
      .replace(/^status:\s*.+$/m, 'status: draft')
    await savePlan(plan.meta.id, reset)
    await selectPlan(plan.meta.id)
    setRunning(plan.meta.id)
    await triggerSkill(`/skill:drupal-plan-validate ${plan.meta.id}`)
  }

  const handleDelete = async () => {
    if (!deleting) { setDeleting(true); return }
    try {
      await deletePlan(plan.meta.id)
      removePlan(plan.meta.id)
      await loadPlans()
      selectPlan(null)
    } catch {
      setDeleting(false)
    }
  }

  const handleResetStatus = async () => {
    const updated = plan.raw.replace(/^status:\s*.+$/m, 'status: draft')
    await savePlan(plan.meta.id, updated)
    setRunning(null)
    await loadPlans()
    selectPlan(plan.meta.id)
  }

  const status = plan.meta.status
  const isRunning = status === 'running'
  // Show progress view as soon as Execute is clicked, not just when file reaches 'running'
  const showProgress = executing || isRunning
  const canValidate = status === 'completed' || status === 'failed'

  if (editing) {
    return <PlanEditor id={plan.meta.id} raw={plan.raw} onClose={() => setEditing(false)} />
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-navy-500">
        <div className="flex items-start gap-2 mb-2">
          <h2 className="flex-1 text-sm font-semibold text-gray-200 min-w-0">{plan.meta.title}</h2>
          <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded border font-medium ${STATUS_STYLES[plan.meta.status] ?? STATUS_STYLES.draft}`}>
            {plan.meta.status}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-navy-400 bg-navy-600 px-1.5 py-0.5 rounded">{plan.meta.source}</span>
          {plan.meta.created && (
            <span className="text-[10px] text-navy-500">{new Date(plan.meta.created).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-navy-500">
        <button
          type="button"
          onClick={handleExecute}
          disabled={isRunning || executing}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-drupal-blue text-white rounded hover:bg-drupal-blue-light disabled:opacity-40 transition-colors"
          title="Execute plan"
        >
          {executing || isRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Execute
        </button>
        <button
          type="button"
          onClick={handleValidate}
          disabled={!canValidate || executing}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-ai-teal/40 text-ai-teal rounded hover:bg-ai-teal/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={canValidate ? 'Validate plan' : 'Execute the plan first before validating'}
        >
          {validating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Validate
        </button>
        {showProgress && (
          <button
            type="button"
            onClick={handleResetStatus}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-navy-500 text-navy-400 rounded hover:border-accent-red/50 hover:text-accent-red transition-colors"
            title="Reset stuck running status back to draft"
          >
            <RotateCw size={11} />
            Reset
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1.5 text-navy-400 hover:text-gray-200 transition-colors"
          title="Edit plan"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => { loadPlans() }}
          className="p-1.5 text-navy-400 hover:text-gray-200 transition-colors"
          title="Refresh"
        >
          <RotateCw size={13} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className={`p-1.5 transition-colors ${deleting ? 'text-accent-red' : 'text-navy-400 hover:text-accent-red'}`}
          title={deleting ? 'Click again to confirm delete' : 'Delete plan'}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3 overflow-y-auto min-h-0 text-sm">
        {showProgress ? <PlanRunningBody body={plan.body} /> : <MarkdownContent content={plan.body} />}
      </div>

      {/* Run history */}
      {plan.meta.runs && plan.meta.runs.length > 0 && (
        <div className="flex-shrink-0 border-t border-navy-500">
          <button
            type="button"
            onClick={() => setShowRuns((v) => !v)}
            className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] text-navy-400 hover:text-navy-300 transition-colors"
          >
            {showRuns ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Run history ({plan.meta.runs.length})
          </button>
          {showRuns && (
            <div className="px-4 pb-3 space-y-1">
              {plan.meta.runs.map((run, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    run.status === 'completed' ? 'bg-accent-green/15 text-accent-green' :
                    run.status === 'failed' ? 'bg-accent-red/15 text-accent-red' :
                    'bg-ai-teal/15 text-ai-teal'
                  }`}>{run.status}</span>
                  <span className="text-navy-400">{new Date(run.startedAt).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {run.completedAt && (
                    <span className="text-navy-500">
                      {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
