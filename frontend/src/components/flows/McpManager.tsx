import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, ExternalLink, ChevronDown, ChevronRight, Eye, EyeOff, Terminal } from 'lucide-react'
import {
  MCP_CATALOG, CATEGORY_LABELS,
  loadMcpConfig, addMcpServer, removeMcpServer,
} from '@/api/mcp'
import type { McpCatalogEntry, McpConfig } from '@/api/mcp'

const CATEGORY_ORDER: McpCatalogEntry['category'][] = [
  'dev', 'productivity', 'design', 'communication', 'data',
]

interface ConfigFormProps {
  entry: McpCatalogEntry
  onSave: (id: string, env: Record<string, string>) => Promise<void>
  onClose: () => void
}

interface ScriptInfoModalProps {
  entry: McpCatalogEntry
  onAdd: () => Promise<void>
  onClose: () => void
}

function ScriptInfoModal({ entry, onAdd, onClose }: ScriptInfoModalProps) {
  const [adding, setAdding] = useState(false)
  const lines = entry.scriptNote?.split('\n') ?? []

  const handleAdd = async () => {
    setAdding(true)
    try { await onAdd() } finally { setAdding(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-500">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-ai-teal" />
            <div>
              <h3 className="text-sm font-semibold text-white">{entry.name}</h3>
              <p className="text-[11px] text-navy-400 mt-0.5">Script-based integration</p>
            </div>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-5">
          <div className="bg-navy-900 rounded-lg px-4 py-3 border border-navy-600 space-y-1">
            {lines.map((line, i) => (
              <p key={i} className={`text-[11px] ${line.startsWith(' ') ? 'text-navy-300 font-mono' : line === '' ? 'h-1' : 'text-navy-400'}`}>
                {line || ' '}
              </p>
            ))}
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-4">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs text-navy-300 hover:text-white border border-navy-600 rounded-lg">Close</button>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-40 text-white rounded-lg"
          >
            {adding ? 'Registering...' : <><Check size={12} /> Register</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfigForm({ entry, onSave, onClose }: ConfigFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(entry.envKeys.map(k => [k.key, '']))
  )
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(entry.id, values)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = entry.envKeys.every(k => !k.secret || values[k.key]?.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-navy-500 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-500">
          <div>
            <h3 className="text-sm font-semibold text-white">Configure {entry.name}</h3>
            <p className="text-[11px] text-navy-400 mt-0.5">{entry.description}</p>
          </div>
          <button onClick={onClose} className="text-navy-400 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-3">
          {entry.envKeys.length === 0 ? (
            <p className="text-xs text-navy-400">This MCP requires no configuration.</p>
          ) : (
            entry.envKeys.map(envKey => (
              <div key={envKey.key}>
                <label className="text-[10px] text-navy-400 uppercase tracking-wider">{envKey.label}</label>
                {envKey.hint && (
                  <p className="text-[9px] text-navy-500 mb-1">{envKey.hint}</p>
                )}
                <div className="relative">
                  <input
                    type={envKey.secret && !revealed[envKey.key] ? 'password' : 'text'}
                    value={values[envKey.key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [envKey.key]: e.target.value }))}
                    placeholder={envKey.secret ? '••••••••' : envKey.key}
                    className="w-full bg-navy-700 border border-navy-500 focus:border-ai-teal rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-navy-600 pr-8"
                  />
                  {envKey.secret && (
                    <button
                      type="button"
                      onClick={() => setRevealed(r => ({ ...r, [envKey.key]: !r[envKey.key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-500 hover:text-navy-300"
                    >
                      {revealed[envKey.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Command preview */}
          <div className="bg-navy-900 rounded-lg px-3 py-2 border border-navy-600">
            <p className="text-[9px] text-navy-500 uppercase tracking-wider mb-1">Command</p>
            <code className="text-[10px] text-navy-300 break-all">
              {entry.command} {entry.args.join(' ')}
            </code>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          {entry.docsUrl ? (
            <a href={entry.docsUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-drupal-blue-light hover:text-ai-teal">
              <ExternalLink size={10} /> Documentation
            </a>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-navy-300 hover:text-white">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-40 text-white rounded-lg"
            >
              {saving ? 'Saving...' : <><Check size={12} /> Add</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function McpManager() {
  const [config, setConfig] = useState<McpConfig>({ mcpServers: {} })
  const [, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState<McpCatalogEntry | null>(null)
  const [scriptInfo, setScriptInfo] = useState<McpCatalogEntry | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('dev')

  const reload = async () => {
    setLoading(true)
    try { setConfig(await loadMcpConfig()) }
    finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [])

  const installedIds = new Set(Object.keys(config.mcpServers))

  const handleAdd = async (entry: McpCatalogEntry, env: Record<string, string>) => {
    const serverConfig = {
      command: entry.command,
      args: entry.args.map(a => a.startsWith('{{') ? env[a.slice(2, -2)] ?? a : a),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    }
    await addMcpServer(entry.id, serverConfig)
    await reload()
  }

  const handleAddScript = async (entry: McpCatalogEntry) => {
    await addMcpServer(entry.id, { command: 'script', args: [] })
    await reload()
  }

  const openEntry = (entry: McpCatalogEntry) => {
    if (entry.scriptBased) setScriptInfo(entry)
    else setConfiguring(entry)
  }

  const handleRemove = async (id: string) => {
    if (removingId === id) {
      await removeMcpServer(id)
      setRemovingId(null)
      await reload()
    } else {
      setRemovingId(id)
    }
  }

  const byCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    label: CATEGORY_LABELS[cat],
    entries: MCP_CATALOG.filter(e => e.category === cat),
  }))

  const installedEntries = MCP_CATALOG.filter(e => installedIds.has(e.id))

  return (
    <>
      {configuring && (
        <ConfigForm
          entry={configuring}
          onSave={(_, env) => handleAdd(configuring, env)}
          onClose={() => setConfiguring(null)}
        />
      )}
      {scriptInfo && (
        <ScriptInfoModal
          entry={scriptInfo}
          onAdd={() => handleAddScript(scriptInfo).then(() => setScriptInfo(null))}
          onClose={() => setScriptInfo(null)}
        />
      )}

      <div className="h-full overflow-y-auto p-4 space-y-5">
        {/* Installed */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">
            Installed ({installedEntries.length})
          </h3>
          {installedEntries.length === 0 ? (
            <p className="text-[11px] text-navy-500 italic">No MCPs configured yet.</p>
          ) : (
            <div className="space-y-1.5">
              {installedEntries.map(entry => (
                <div key={entry.id} className="bg-navy-700 border border-ai-teal/30 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-white">{entry.name}</span>
                      {entry.scriptBased
                        ? <span className="ml-2 text-[9px] text-ai-teal bg-ai-teal/10 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Terminal size={8} /> script</span>
                        : <span className="ml-2 text-[9px] text-ai-teal bg-ai-teal/10 px-1.5 py-0.5 rounded">active</span>
                      }
                      <p className="text-[10px] text-navy-400 mt-0.5">{entry.description}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(entry.id)}
                      className={`p-1.5 rounded flex-shrink-0 transition-colors ${
                        removingId === entry.id ? 'text-accent-red' : 'text-navy-500 hover:text-accent-red'
                      }`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {removingId === entry.id && (
                    <p className="text-[10px] text-accent-red mt-1">Click again to confirm</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Catalog */}
        <div>
          <h3 className="text-[10px] uppercase tracking-wider text-navy-400 mb-2">Catalogue</h3>
          <div className="space-y-2">
            {byCategory.map(({ cat, label, entries }) => (
              <div key={cat} className="border border-navy-600 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-navy-700 hover:bg-navy-600 transition-colors"
                >
                  <span className="text-[11px] font-medium text-navy-300">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-navy-500">{entries.length}</span>
                    {expandedCategory === cat ? <ChevronDown size={12} className="text-navy-400" /> : <ChevronRight size={12} className="text-navy-400" />}
                  </div>
                </button>

                {expandedCategory === cat && (
                  <div className="divide-y divide-navy-700">
                    {entries.map(entry => {
                      const installed = installedIds.has(entry.id)
                      return (
                        <div key={entry.id} className="flex items-center justify-between px-3 py-2.5 bg-navy-800">
                          <div className="min-w-0">
                            <span className="text-xs text-gray-300 font-medium">{entry.name}</span>
                            <p className="text-[10px] text-navy-500 mt-0.5 truncate">{entry.description}</p>
                          </div>
                          <button
                            onClick={() => !installed && openEntry(entry)}
                            disabled={installed}
                            className={`flex-shrink-0 ml-3 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] transition-colors ${
                              installed
                                ? 'bg-ai-teal/10 text-ai-teal border border-ai-teal/20 cursor-default'
                                : entry.scriptBased
                                  ? 'bg-navy-600 hover:bg-navy-500 text-ai-teal border border-ai-teal/30'
                                  : 'bg-navy-600 hover:bg-navy-500 text-gray-300 border border-navy-500'
                            }`}
                          >
                            {installed
                              ? <><Check size={10} /> Active</>
                              : entry.scriptBased
                                ? <><Terminal size={10} /> Script</>
                                : <><Plus size={10} /> Add</>
                            }
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <p className="text-[9px] text-navy-600 italic">
          After adding an MCP, restart the agent with /restart to activate it.
        </p>
      </div>
    </>
  )
}
