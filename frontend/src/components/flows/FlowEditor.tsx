import { useState, useEffect } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, X, Zap, MessageSquare, Check, Clock, Calendar, Puzzle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getAllCommands } from '@/api/skills'
import { loadMcpConfig } from '@/api/mcp'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Flow, FlowStep, FlowParam, FlowSchedule } from '@/api/flows'

function uid() { return crypto.randomUUID() }

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Returns UTC offset in minutes for an IANA timezone (positive = UTC+)
function getUtcOffsetMinutes(timezone: string): number {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0')
  const tzMs = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((tzMs - now.getTime()) / 60000)
}

// Convert local HH:MM in a timezone to UTC HH:MM + day shift (-1, 0, +1)
function localToUtc(localHour: number, localMinute: number, timezone: string) {
  const offsetMin = getUtcOffsetMinutes(timezone)
  const utcTotal = localHour * 60 + localMinute - offsetMin
  const dayShift = utcTotal < 0 ? -1 : utcTotal >= 1440 ? 1 : 0
  const norm = ((utcTotal % 1440) + 1440) % 1440
  return { utcHour: Math.floor(norm / 60), utcMinute: norm % 60, dayShift: dayShift as -1 | 0 | 1 }
}

function shiftDays(days: number[], shift: -1 | 0 | 1): number[] {
  if (shift === 0) return days
  return [...new Set(days.map(d => ((d + shift + 7) % 7)))].sort((a, b) => a - b)
}

const TIMEZONES: { label: string; value: string }[] = [
  { label: 'UTC', value: 'UTC' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Lisbon (WET/WEST)', value: 'Europe/Lisbon' },
  { label: 'Madrid / Paris / Berlin', value: 'Europe/Paris' },
  { label: 'Helsinki / Athens', value: 'Europe/Helsinki' },
  { label: 'Moscow', value: 'Europe/Moscow' },
  { label: 'Dubai (Gulf)', value: 'Asia/Dubai' },
  { label: 'Mumbai (IST)', value: 'Asia/Kolkata' },
  { label: 'Bangkok (ICT)', value: 'Asia/Bangkok' },
  { label: 'Singapore / KL', value: 'Asia/Singapore' },
  { label: 'Tokyo / Seoul', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEDT/AEST)', value: 'Australia/Sydney' },
  { label: 'Auckland (NZDT/NZST)', value: 'Pacific/Auckland' },
  { label: 'New York (ET)', value: 'America/New_York' },
  { label: 'Chicago (CT)', value: 'America/Chicago' },
  { label: 'Denver (MT)', value: 'America/Denver' },
  { label: 'Los Angeles (PT)', value: 'America/Los_Angeles' },
  { label: 'São Paulo (BRT)', value: 'America/Sao_Paulo' },
]

type CronPreset = 'daily' | 'weekdays' | 'weekends' | 'custom'

function buildCronExpression(hour: string, minute: string, preset: CronPreset, customDays: number[], timezone: string): string {
  const localDays = preset === 'daily' ? [0,1,2,3,4,5,6]
    : preset === 'weekdays' ? [1,2,3,4,5]
    : preset === 'weekends' ? [0,6]
    : customDays

  const { utcHour, utcMinute, dayShift } = localToUtc(parseInt(hour), parseInt(minute), timezone)
  const h = String(utcHour).padStart(2, '0')
  const m = String(utcMinute).padStart(2, '0')

  if (preset === 'daily') return `${m} ${h} * * *`
  const utcDays = shiftDays(localDays, dayShift)
  return `${m} ${h} * * ${utcDays.join(',')}`
}

function buildScheduleLabel(type: 'interval' | 'cron', intervalMinutes: number, hour: string, minute: string, preset: CronPreset, customDays: number[], timezone: string): string {
  if (type === 'interval') {
    if (intervalMinutes < 60) return `A cada ${intervalMinutes} minutos`
    if (intervalMinutes === 60) return 'A cada hora'
    if (intervalMinutes % 1440 === 0) return `A cada ${intervalMinutes / 1440} dia${intervalMinutes / 1440 > 1 ? 's' : ''}`
    return `A cada ${intervalMinutes / 60} horas`
  }
  const time = `${hour}:${minute}`
  const tzShort = TIMEZONES.find(t => t.value === timezone)?.label.replace(/ \(.*\)/, '') ?? timezone
  if (preset === 'daily') return `Todos os dias às ${time} (${tzShort})`
  if (preset === 'weekdays') return `Seg-Sex às ${time} (${tzShort})`
  if (preset === 'weekends') return `Sáb-Dom às ${time} (${tzShort})`
  const names = customDays.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(', ')
  return `${names || 'Nenhum dia'} às ${time} (${tzShort})`
}

function parseCronPreset(expr: string): { hour: string; minute: string; preset: CronPreset; customDays: number[] } {
  const parts = expr.split(' ')
  const minute = parts[0] ?? '00'
  const hour = parts[1] ?? '09'
  const days = parts[4] ?? '*'
  if (days === '*') return { hour, minute, preset: 'daily', customDays: [] }
  if (days === '1-5') return { hour, minute, preset: 'weekdays', customDays: [] }
  if (days === '0,6') return { hour, minute, preset: 'weekends', customDays: [] }
  return { hour, minute, preset: 'custom', customDays: days.split(',').map(Number).filter(n => !isNaN(n)) }
}

interface Props {
  initial?: Flow
  onSave: (flow: Flow) => Promise<void>
  onClose: () => void
}

export function FlowEditor({ initial, onSave, onClose }: Props) {
  const { scheduleTimezone: defaultTz, setScheduleTimezone } = useSettingsStore()

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [trigger, setTrigger] = useState<'manual' | 'schedule'>(initial?.trigger ?? 'manual')

  // Schedule state
  const [scheduleType, setScheduleType] = useState<'interval' | 'cron'>(
    initial?.schedule?.scheduleType ?? 'cron'
  )
  const [timezone, setTimezone] = useState(initial?.schedule?.timezone ?? defaultTz)
  const [intervalMinutes, setIntervalMinutes] = useState(initial?.schedule?.intervalMinutes ?? 60)
  const initialCron = initial?.schedule?.cronExpression
    ? parseCronPreset(initial.schedule.cronExpression)
    : { hour: '09', minute: '00', preset: 'daily' as CronPreset, customDays: [] }
  const [cronHour, setCronHour] = useState(initialCron.hour)
  const [cronMinute, setCronMinute] = useState(initialCron.minute)
  const [cronPreset, setCronPreset] = useState<CronPreset>(initialCron.preset)
  const [cronCustomDays, setCronCustomDays] = useState<number[]>(initialCron.customDays)

  const [params, setParams] = useState<FlowParam[]>(initial?.params ?? [])
  const [steps, setSteps] = useState<FlowStep[]>(initial?.steps ?? [])
  const [saving, setSaving] = useState(false)
  const [skillSearch, setSkillSearch] = useState('')
  const [pickingForStep, setPickingForStep] = useState<string | null>(null)
  const [installedMcps, setInstalledMcps] = useState<string[]>([])

  useEffect(() => {
    loadMcpConfig().then(cfg => setInstalledMcps(Object.keys(cfg.mcpServers)))
  }, [])

  const { data: allCommands = [] } = useQuery({
    queryKey: ['commands'],
    queryFn: getAllCommands,
    staleTime: 60000,
  })

  const filteredSkills = allCommands.filter(c =>
    !skillSearch || c.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
    c.description?.toLowerCase().includes(skillSearch.toLowerCase())
  )

  const addParam = () => setParams(p => [...p, { key: '', label: '', default: '' }])
  const removeParam = (i: number) => setParams(p => p.filter((_, idx) => idx !== i))
  const updateParam = (i: number, patch: Partial<FlowParam>) =>
    setParams(p => p.map((param, idx) => idx === i ? { ...param, ...patch } : param))

  const addStep = (type: 'skill' | 'message' | 'mcp') =>
    setSteps(s => [...s, { id: uid(), type, content: '', mcpServer: type === 'mcp' ? (installedMcps[0] ?? '') : undefined }])
  const removeStep = (id: string) => setSteps(s => s.filter(step => step.id !== id))
  const moveStep = (id: string, dir: -1 | 1) =>
    setSteps(s => {
      const idx = s.findIndex(step => step.id === id)
      if (idx + dir < 0 || idx + dir >= s.length) return s
      const next = [...s];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]]
      return next
    })
  const updateStep = (id: string, patch: Partial<FlowStep>) =>
    setSteps(s => s.map(step => step.id === id ? { ...step, ...patch } : step))
  const selectSkill = (stepId: string, command: string, label: string) => {
    updateStep(stepId, { command, label })
    setPickingForStep(null)
    setSkillSearch('')
  }

  const toggleCustomDay = (day: number) =>
    setCronCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return
    setSaving(true)
    try {
      let schedule: FlowSchedule | undefined
      if (trigger === 'schedule') {
        if (scheduleType === 'cron') setScheduleTimezone(timezone)
        const cronExpression = scheduleType === 'cron'
          ? buildCronExpression(cronHour, cronMinute, cronPreset, cronCustomDays, timezone)
          : undefined
        schedule = {
          scheduleType,
          intervalMinutes: scheduleType === 'interval' ? intervalMinutes : undefined,
          cronExpression,
          timezone: scheduleType === 'cron' ? timezone : undefined,
          label: buildScheduleLabel(scheduleType, intervalMinutes, cronHour, cronMinute, cronPreset, cronCustomDays, timezone),
        }
      }
      await onSave({
        id: initial?.id ?? uid(),
        name: name.trim(),
        description: description.trim() || undefined,
        trigger,
        schedule,
        params,
        steps,
        createdAt: initial?.createdAt ?? Date.now(),
        lastRunAt: initial?.lastRunAt,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-500 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">{initial ? 'Editar flow' : 'Novo flow'}</h2>
          <button onClick={onClose} className="text-navy-300 hover:text-white"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name + description */}
          <div className="space-y-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome do flow"
              className="w-full bg-navy-700 border border-navy-500 focus:border-ai-teal rounded-lg px-3 py-2 text-sm text-white outline-none placeholder:text-navy-400"
            />
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              className="w-full bg-navy-700 border border-navy-500 focus:border-ai-teal rounded-lg px-3 py-2 text-xs text-gray-300 outline-none placeholder:text-navy-400"
            />
          </div>

          {/* Trigger */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-navy-300 block mb-2">Trigger</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setTrigger('manual')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${trigger === 'manual' ? 'bg-drupal-blue border-drupal-blue text-white' : 'bg-navy-700 border-navy-600 text-navy-300 hover:border-navy-400'}`}>
                <Clock size={11} /> Manual
              </button>
              <button type="button" onClick={() => setTrigger('schedule')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${trigger === 'schedule' ? 'bg-drupal-blue border-drupal-blue text-white' : 'bg-navy-700 border-navy-600 text-navy-300 hover:border-navy-400'}`}>
                <Calendar size={11} /> Agendado
              </button>
            </div>

            {trigger === 'schedule' && (
              <div className="mt-2 bg-navy-700 border border-navy-600 rounded-lg p-3 space-y-3">
                {/* Schedule type tabs */}
                <div className="flex gap-1">
                  {(['interval', 'cron'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setScheduleType(t)}
                      className={`px-2.5 py-1 text-[10px] rounded border transition-colors ${scheduleType === t ? 'bg-navy-600 border-ai-teal text-ai-teal' : 'border-navy-500 text-navy-300 hover:text-white'}`}>
                      {t === 'interval' ? 'Intervalo' : 'Hora específica'}
                    </button>
                  ))}
                </div>

                {scheduleType === 'interval' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-navy-300">A cada</span>
                    <select value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))}
                      className="bg-navy-800 border border-navy-500 focus:border-ai-teal rounded px-2 py-1 text-xs text-white outline-none">
                      <option value={5}>5 minutos</option>
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                      <option value={360}>6 horas</option>
                      <option value={720}>12 horas</option>
                      <option value={1440}>24 horas</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Time picker */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-navy-300 w-8">Hora</span>
                      <input
                        type="number" min="0" max="23" value={cronHour}
                        onChange={e => setCronHour(e.target.value.padStart(2, '0'))}
                        className="w-14 bg-navy-800 border border-navy-500 focus:border-ai-teal rounded px-2 py-1 text-xs text-white outline-none text-center"
                      />
                      <span className="text-navy-300 text-xs">:</span>
                      <input
                        type="number" min="0" max="59" value={cronMinute}
                        onChange={e => setCronMinute(e.target.value.padStart(2, '0'))}
                        className="w-14 bg-navy-800 border border-navy-500 focus:border-ai-teal rounded px-2 py-1 text-xs text-white outline-none text-center"
                      />
                    </div>

                    {/* Day presets */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] text-navy-300 w-8">Dias</span>
                      {(['daily', 'weekdays', 'weekends', 'custom'] as const).map(p => (
                        <button key={p} type="button" onClick={() => setCronPreset(p)}
                          className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${cronPreset === p ? 'bg-navy-600 border-ai-teal text-ai-teal' : 'border-navy-500 text-navy-300 hover:text-white'}`}>
                          {p === 'daily' ? 'Todos' : p === 'weekdays' ? 'Seg-Sex' : p === 'weekends' ? 'Sáb-Dom' : 'Personalizado'}
                        </button>
                      ))}
                    </div>

                    {cronPreset === 'custom' && (
                      <div className="flex gap-1 pl-8">
                        {DAY_LABELS.map((label, i) => (
                          <button key={i} type="button" onClick={() => toggleCustomDay(i)}
                            className={`w-8 h-8 text-[9px] rounded border transition-colors ${cronCustomDays.includes(i) ? 'bg-ai-teal/20 border-ai-teal text-ai-teal' : 'border-navy-500 text-navy-300 hover:border-navy-400'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Timezone */}
                    <div className="flex items-center gap-2 pl-8">
                      <span className="text-[10px] text-navy-300 flex-shrink-0">Fuso</span>
                      <select value={timezone} onChange={e => setTimezone(e.target.value)}
                        className="flex-1 bg-navy-800 border border-navy-500 focus:border-ai-teal rounded px-2 py-1 text-xs text-white outline-none">
                        {TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* UTC preview */}
                    {(() => {
                      const { utcHour, utcMinute } = localToUtc(parseInt(cronHour), parseInt(cronMinute), timezone)
                      return (
                        <p className="text-[9px] text-navy-400 font-mono pl-8">
                          {cronHour}:{cronMinute} local → {String(utcHour).padStart(2,'0')}:{String(utcMinute).padStart(2,'0')} UTC
                          {' · '}cron: {buildCronExpression(cronHour, cronMinute, cronPreset, cronCustomDays, timezone)}
                        </p>
                      )
                    })()}
                  </div>
                )}

                <p className="text-[9px] text-ai-teal/70">
                  Executado pelo PiClaw — funciona mesmo com o browser fechado.
                </p>
              </div>
            )}
          </div>

          {/* Params */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-navy-300">Parâmetros</span>
              <button onClick={addParam} className="text-[10px] text-ai-teal hover:text-white flex items-center gap-1">
                <Plus size={11} /> Adicionar
              </button>
            </div>
            {params.length === 0 && (
              <p className="text-[10px] text-navy-400 italic">Sem parâmetros — usa {'{{'}<span className="text-navy-300">variavel</span>{'}}'}  nas mensagens para criar um.</p>
            )}
            <div className="space-y-1.5">
              {params.map((param, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={param.key} onChange={e => updateParam(i, { key: e.target.value.replace(/\W/g, '_') })}
                    placeholder="chave"
                    className="w-28 bg-navy-700 border border-navy-600 rounded px-2 py-1 text-xs font-mono text-ai-teal outline-none focus:border-ai-teal" />
                  <input value={param.label} onChange={e => updateParam(i, { label: e.target.value })}
                    placeholder="Label para o utilizador"
                    className="flex-1 bg-navy-700 border border-navy-600 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-ai-teal" />
                  <input value={param.default ?? ''} onChange={e => updateParam(i, { default: e.target.value })}
                    placeholder="default"
                    className="w-24 bg-navy-700 border border-navy-600 rounded px-2 py-1 text-xs text-navy-300 outline-none focus:border-ai-teal" />
                  <button onClick={() => removeParam(i)} className="text-navy-400 hover:text-accent-red flex-shrink-0"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-navy-300">Steps</span>
              <div className="flex gap-2">
                <button onClick={() => addStep('skill')} className="text-[10px] text-ai-teal hover:text-white flex items-center gap-1">
                  <Zap size={11} /> Skill
                </button>
                <button onClick={() => addStep('message')} className="text-[10px] text-drupal-blue-light hover:text-white flex items-center gap-1">
                  <MessageSquare size={11} /> Mensagem
                </button>
                <button
                  onClick={() => addStep('mcp')}
                  disabled={installedMcps.length === 0}
                  title={installedMcps.length === 0 ? 'Nenhum MCP instalado — configura na tab MCPs' : undefined}
                  className="text-[10px] text-violet-400 hover:text-white flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Puzzle size={11} /> MCP
                </button>
              </div>
            </div>

            {steps.length === 0 && (
              <p className="text-[10px] text-navy-400 italic">Adiciona pelo menos um step.</p>
            )}

            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-navy-700 border border-navy-600 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    {step.type === 'skill'
                      ? <Zap size={12} className="text-ai-teal flex-shrink-0" />
                      : step.type === 'mcp'
                        ? <Puzzle size={12} className="text-violet-400 flex-shrink-0" />
                        : <MessageSquare size={12} className="text-drupal-blue-light flex-shrink-0" />
                    }
                    <span className="text-[10px] uppercase tracking-wider text-navy-300">
                      {idx + 1}. {step.type === 'skill' ? 'Skill' : step.type === 'mcp' ? 'MCP' : 'Mensagem'}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => moveStep(step.id, -1)} disabled={idx === 0} className="text-navy-400 hover:text-white disabled:opacity-30"><ArrowUp size={12} /></button>
                      <button onClick={() => moveStep(step.id, 1)} disabled={idx === steps.length - 1} className="text-navy-400 hover:text-white disabled:opacity-30"><ArrowDown size={12} /></button>
                      <button onClick={() => removeStep(step.id)} className="text-navy-400 hover:text-accent-red"><Trash2 size={12} /></button>
                    </div>
                  </div>

                  {step.type === 'mcp' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-navy-300 flex-shrink-0">Servidor</label>
                        {installedMcps.length > 0 ? (
                          <select
                            value={step.mcpServer ?? ''}
                            onChange={e => updateStep(step.id, { mcpServer: e.target.value, label: e.target.value })}
                            className="flex-1 bg-navy-800 border border-navy-500 focus:border-violet-400 rounded px-2 py-1 text-xs text-violet-300 outline-none"
                          >
                            {installedMcps.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className="text-[10px] text-accent-red">Nenhum MCP instalado</span>
                        )}
                      </div>
                      <textarea
                        value={step.content ?? ''}
                        onChange={e => updateStep(step.id, { content: e.target.value })}
                        placeholder="Instrução para o agente usar este MCP... usa {{param}} para parâmetros"
                        rows={3}
                        className="w-full bg-navy-800 border border-navy-600 focus:border-violet-400 rounded px-3 py-2 text-xs text-gray-300 outline-none resize-none placeholder:text-navy-500 font-mono leading-relaxed"
                      />
                    </div>
                  ) : step.type === 'skill' ? (
                    <div>
                      {step.command ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-ai-teal">{step.command}</span>
                          <button onClick={() => setPickingForStep(step.id)} className="text-[10px] text-navy-300 hover:text-white">Mudar</button>
                        </div>
                      ) : (
                        <button onClick={() => setPickingForStep(step.id)}
                          className="w-full text-left text-xs text-navy-300 hover:text-ai-teal border border-dashed border-navy-500 rounded px-3 py-1.5">
                          Seleccionar skill...
                        </button>
                      )}
                      {pickingForStep === step.id && (
                        <div className="mt-2 bg-navy-800 border border-navy-500 rounded-lg overflow-hidden">
                          <input autoFocus value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
                            placeholder="Filtrar skills..."
                            className="w-full bg-transparent px-3 py-2 text-xs text-white outline-none border-b border-navy-600 placeholder:text-navy-500" />
                          <div className="max-h-40 overflow-y-auto">
                            {filteredSkills.map(cmd => (
                              <button key={cmd.name}
                                onClick={() => selectSkill(step.id, cmd.name, cmd.description ?? cmd.name)}
                                className="w-full flex items-start gap-2 px-3 py-1.5 text-left hover:bg-navy-700 text-xs">
                                <span className="font-mono text-ai-teal flex-shrink-0">{cmd.name}</span>
                                <span className="text-navy-300 truncate">{cmd.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <textarea value={step.content ?? ''} onChange={e => updateStep(step.id, { content: e.target.value })}
                      placeholder="Mensagem para o agente... usa {{param}} para parâmetros"
                      rows={3}
                      className="w-full bg-navy-800 border border-navy-600 focus:border-ai-teal rounded px-3 py-2 text-xs text-gray-300 outline-none resize-none placeholder:text-navy-500 font-mono leading-relaxed" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-navy-500 flex-shrink-0">
          <p className="text-[10px] text-navy-400">
            {steps.length === 0 ? 'Adiciona pelo menos um step' : `${steps.length} step${steps.length > 1 ? 's' : ''}`}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-navy-300 hover:text-white">Cancelar</button>
            <button onClick={handleSave} disabled={!name.trim() || steps.length === 0 || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-40 text-white rounded-lg transition-colors">
              {saving ? 'A guardar...' : <><Check size={12} /> Guardar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
