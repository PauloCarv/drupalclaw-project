import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { Save, Loader2 } from 'lucide-react'
import { savePlan } from '@/api/plans'
import { usePlansStore } from '@/stores/plansStore'

export function PlanEditor({ id, raw, onClose }: { id: string; raw: string; onClose: () => void }) {
  const [value, setValue] = useState(raw)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { refreshSelectedPlan, loadPlans } = usePlansStore()

  useEffect(() => {
    setValue(raw)
    setDirty(false)
  }, [raw])

  const handleChange = (v: string | undefined) => {
    setValue(v ?? '')
    setDirty(true)
  }

  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await savePlan(id, value)
      setDirty(false)
      await refreshSelectedPlan()
      await loadPlans()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-navy-500 flex-shrink-0">
        <span className="text-[11px] text-navy-400 font-mono">{id}.md</span>
        <div className="flex items-center gap-2">
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-ai-teal" title="Unsaved changes" />}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-drupal-blue text-white rounded hover:bg-drupal-blue-light disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-navy-400 hover:text-gray-200 px-2 py-0.5 rounded border border-navy-500 hover:border-navy-400 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          language="markdown"
          value={value}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            padding: { top: 8, bottom: 8 },
          }}
        />
      </div>
    </div>
  )
}
