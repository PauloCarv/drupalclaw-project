import { useState, useEffect, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createPlan } from '@/api/plans'
import { usePlansStore } from '@/stores/plansStore'
import { useLayoutStore } from '@/stores/layoutStore'

interface Props {
  prefillTitle?: string
  prefillContext?: string
  prefillSteps?: string[]
  prefillSource?: string
  onClose: () => void
  onCreated?: (id: string) => void
}

export function NewPlanDialog({ prefillTitle = '', prefillContext = '', prefillSteps = [], prefillSource = 'manual', onClose, onCreated }: Props) {
  const [title, setTitle] = useState(prefillTitle)
  const [context, setContext] = useState(prefillContext)
  const [stepsText, setStepsText] = useState(prefillSteps.join('\n'))
  const [verificationText, setVerificationText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const { loadPlans, selectPlan, addOrUpdateSummary } = usePlansStore()
  const { setMainTab } = useLayoutStore()

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const id = await createPlan({
        title: title.trim(),
        source: prefillSource,
        context: context.trim(),
        steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean),
        verification: verificationText.split('\n').map((s) => s.trim()).filter(Boolean),
      })
      // Optimistically add to list so UI updates immediately
      const now = new Date().toISOString()
      addOrUpdateSummary({ id, title: title.trim(), status: 'draft', source: prefillSource, created: now, updated: now })
      setMainTab('plans')
      onCreated?.(id)
      onClose()
      await selectPlan(id)
      setTimeout(() => loadPlans(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create plan')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-navy-700 border border-navy-500 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-navy-500">
          <h2 className="text-sm font-semibold text-gray-200">New Plan</h2>
          <button onClick={onClose} className="text-navy-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] text-navy-300 mb-1">Title <span className="text-accent-red">*</span></label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-ai-teal"
              placeholder="e.g. Install Admin Toolbar"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] text-navy-300 mb-1">Context</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-ai-teal resize-none"
              placeholder="What does this plan do and why?"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-[11px] text-navy-300 mb-1">Steps <span className="text-navy-500">(one per line)</span></label>
            <textarea
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-ai-teal resize-none font-mono"
              placeholder={"composer require drupal/module\ndrush en module -y\ndrush cache:rebuild"}
              rows={4}
            />
          </div>

          <div>
            <label className="block text-[11px] text-navy-300 mb-1">Verification <span className="text-navy-500">(one per line)</span></label>
            <textarea
              value={verificationText}
              onChange={(e) => setVerificationText(e.target.value)}
              className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-gray-200 outline-none focus:border-ai-teal resize-none font-mono"
              placeholder={"Module is enabled (drush pm:list)\nSite loads without errors"}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-xs text-accent-red">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-navy-300 border border-navy-500 rounded hover:border-navy-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="px-3 py-1.5 text-xs bg-drupal-blue text-white rounded hover:bg-drupal-blue-light disabled:opacity-40 transition-colors flex items-center gap-1.5"
            >
              {saving && <Loader2 size={11} className="animate-spin" />}
              Create Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
