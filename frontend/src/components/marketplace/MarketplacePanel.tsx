import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShoppingBag, Plus, Trash2, Download, ExternalLink, Puzzle, Zap, AlertCircle, CheckCircle, Loader, Search } from 'lucide-react'
import {
  loadMarketplaceRegistry,
  fetchMarketplaceManifest,
  installMarketplaceSkill,
  installMarketplaceMcp,
  registerMarketplace,
  removeMarketplace,
  type MarketplaceManifest,
  type InstalledMarketplace,
} from '@/api/marketplace'

type ViewState =
  | { mode: 'list' }
  | { mode: 'fetching'; url: string }
  | { mode: 'catalog'; manifest: MarketplaceManifest; url: string }

export function MarketplacePanel() {
  const qc = useQueryClient()
  const [urlInput, setUrlInput] = useState('')
  const [tokenInput, setTokenInput] = useState('')
  const [view, setView] = useState<ViewState>({ mode: 'list' })
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  const { data: registry, isLoading } = useQuery({
    queryKey: ['marketplace-registry'],
    queryFn: loadMarketplaceRegistry,
  })

  const removeMutation = useMutation({
    mutationFn: (slug: string) => removeMarketplace(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace-registry'] }),
  })

  const doFetch = async (url: string, token?: string) => {
    setFetchError(null)
    setInstallError(null)
    setView({ mode: 'fetching', url })
    try {
      const manifest = await fetchMarketplaceManifest(url, token)
      // Pre-populate "Done" state from registry so already-installed skills are marked
      const reg = await loadMarketplaceRegistry()
      const entry = reg.marketplaces.find((m) => m.slug === manifest.slug)
      const preInstalled = new Set<string>((entry?.skills ?? []).map((s) => `skill:${s}`))
      setInstalled(preInstalled)
      setView({ mode: 'catalog', manifest, url })
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch marketplace')
      setView({ mode: 'list' })
    }
  }

  const handleFetch = () => doFetch(urlInput.trim(), tokenInput.trim() || undefined)

  const handleInstallSkill = async (
    manifest: MarketplaceManifest,
    url: string,
    skillName: string
  ) => {
    const skill = manifest.skills.find((s) => s.name === skillName)
    if (!skill) return
    const key = `skill:${skillName}`
    if (installed.has(key)) return  // already installed — ignore click
    setInstalling((prev) => new Set([...prev, key]))
    setInstallError(null)
    try {
      await installMarketplaceSkill(skill, manifest.slug, tokenInput.trim() || undefined)
      await registerMarketplace(manifest, url, skillName)
      qc.invalidateQueries({ queryKey: ['marketplace-registry'] })
      setInstalled((prev) => new Set([...prev, key]))
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  const handleInstallMcp = async (
    manifest: MarketplaceManifest,
    url: string,
    serverId: string
  ) => {
    const server = manifest.mcpServers.find((s) => s.id === serverId)
    if (!server) return
    const key = `mcp:${serverId}`
    setInstalling((prev) => new Set([...prev, key]))
    setInstallError(null)
    try {
      await installMarketplaceMcp(server)
      await registerMarketplace(manifest, url)
      qc.invalidateQueries({ queryKey: ['marketplace-registry'] })
      setInstalled((prev) => new Set([...prev, key]))
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling((prev) => { const s = new Set(prev); s.delete(key); return s })
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* URL input */}
      <div className="p-3 border-b border-navy-600 flex-shrink-0 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            placeholder="https://example.com/marketplace or https://github.com/owner/repo"
            className="flex-1 text-xs bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-gray-300 placeholder-navy-400 focus:outline-none focus:border-ai-teal"
          />
          <button
            onClick={handleFetch}
            disabled={!urlInput.trim() || view.mode === 'fetching'}
            className="flex items-center gap-1.5 px-3 py-2 text-xs bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {view.mode === 'fetching' ? (
              <Loader size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Fetch
          </button>
        </div>
        <input
          type="password"
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          placeholder="Token (optional — required for private repos)"
          className="w-full text-xs bg-navy-700 border border-navy-500 rounded-lg px-3 py-2 text-gray-300 placeholder-navy-400 focus:outline-none focus:border-ai-teal"
        />
        {fetchError && (
          <div className="flex items-start gap-1.5 text-[11px] text-accent-red">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
            {fetchError}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Catalog view */}
        {view.mode === 'catalog' && (
          <CatalogView
            manifest={view.manifest}
            url={view.url}
            installed={installed}
            installing={installing}
            installError={installError}
            onInstallSkill={(name) => handleInstallSkill(view.manifest, view.url, name)}
            onInstallMcp={(id) => handleInstallMcp(view.manifest, view.url, id)}
            onBack={() => { setView({ mode: 'list' }); setInstalled(new Set()); setInstallError(null) }}
          />
        )}

        {/* List view */}
        {view.mode !== 'catalog' && (
          <InstalledList
            marketplaces={registry?.marketplaces ?? []}
            loading={isLoading}
            removing={removeMutation.isPending}
            onRemove={(slug) => removeMutation.mutate(slug)}
            onBrowse={(m) => {
              setUrlInput(m.url)
              doFetch(m.url, tokenInput.trim() || undefined)
            }}
          />
        )}
      </div>
    </div>
  )
}

function CatalogView({
  manifest,
  url: _url,
  installed,
  installing,
  installError,
  onInstallSkill,
  onInstallMcp,
  onBack,
}: {
  manifest: MarketplaceManifest
  url: string
  installed: Set<string>
  installing: Set<string>
  installError: string | null
  onInstallSkill: (name: string) => void
  onInstallMcp: (id: string) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const q = search.toLowerCase()
  const filteredSkills = q
    ? manifest.skills.filter((s) =>
        `${manifest.slug}-${s.name}`.toLowerCase().includes(q)
      )
    : manifest.skills

  const topRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [q])

  const newlyInstalled = [...installed].filter((k) => k.startsWith('skill:')).length

  return (
    <div ref={topRef} className="p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-gray-300">{manifest.name}</div>
          {manifest.description && (
            <div className="text-[11px] text-navy-300 mt-0.5">{manifest.description}</div>
          )}
          {manifest.auth !== 'none' && (
            <div className="mt-1 text-[10px] text-accent-green flex items-center gap-1">
              🔑 Requires authentication
            </div>
          )}
        </div>
        <button onClick={onBack} className="text-[11px] text-navy-400 hover:text-gray-300 flex-shrink-0">
          ← Back
        </button>
      </div>

      {/* Install error */}
      {installError && (
        <div className="flex items-start gap-1.5 text-[11px] text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg p-2">
          <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
          {installError}
        </div>
      )}

      {/* Success banner */}
      {newlyInstalled > 0 && (
        <div className="p-2 rounded-lg bg-accent-green/10 border border-accent-green/20 text-[11px] text-accent-green flex items-center gap-1.5">
          <CheckCircle size={11} />
          {newlyInstalled} skill{newlyInstalled > 1 ? 's' : ''} instalada{newlyInstalled > 1 ? 's' : ''}. Corre <code className="font-mono mx-0.5">/restart</code> no chat para activar.
        </div>
      )}

      {manifest.skills.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-navy-300">
              <Zap size={10} />
              Skills ({manifest.skills.length})
            </div>
          </div>

          {/* Search */}
          {manifest.skills.length > 1 && (
            <div className="relative mb-2">
              <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar skills..."
                className="w-full text-[11px] bg-navy-700 border border-navy-600 rounded-lg pl-7 pr-3 py-1.5 text-gray-300 placeholder-navy-400 focus:outline-none focus:border-ai-teal"
              />
            </div>
          )}

          <div className="space-y-1.5">
            {filteredSkills.map((skill) => {
              const key = `skill:${skill.name}`
              const isInstalled = installed.has(key)
              const isInstalling = installing.has(key)
              return (
                <div
                  key={skill.name}
                  className="flex items-center gap-2 p-2 rounded-lg bg-navy-700 border border-navy-600"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-300 truncate">
                      {manifest.slug}-{skill.name}
                    </div>
                    <div className="text-[10px] text-navy-300 truncate">{skill.description}</div>
                    <div className="text-[9px] text-navy-400 mt-0.5">{skill.format}</div>
                  </div>
                  <InstallButton
                    installed={isInstalled}
                    installing={isInstalling}
                    onClick={() => onInstallSkill(skill.name)}
                  />
                </div>
              )
            })}
            {filteredSkills.length === 0 && (
              <div className="text-center py-4 text-navy-400 text-[11px]">Sem resultados para "{search}"</div>
            )}
          </div>
        </section>
      )}

      {manifest.mcpServers.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-navy-300 mb-2">
            <Puzzle size={10} />
            MCP Servers ({manifest.mcpServers.length})
          </div>
          <div className="space-y-1.5">
            {manifest.mcpServers.map((server) => {
              const key = `mcp:${server.id}`
              const isInstalled = installed.has(key)
              const isInstalling = installing.has(key)
              return (
                <div
                  key={server.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-navy-700 border border-navy-600"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-300 truncate">{server.name}</div>
                    <div className="text-[10px] text-navy-300 truncate">{server.description}</div>
                    <div className="text-[9px] text-navy-400 font-mono mt-0.5">{server.command} {server.args[0]}</div>
                  </div>
                  <InstallButton
                    installed={isInstalled}
                    installing={isInstalling}
                    onClick={() => onInstallMcp(server.id)}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {manifest.skills.length === 0 && manifest.mcpServers.length === 0 && (
        <div className="text-center py-8 text-navy-400 text-xs">
          This marketplace has no skills or MCP servers.
        </div>
      )}
    </div>
  )
}

function InstallButton({
  installed,
  installing,
  onClick,
}: {
  installed: boolean
  installing: boolean
  onClick: () => void
}) {
  if (installed) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-accent-green flex-shrink-0">
        <CheckCircle size={11} /> Instalada
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={installing}
      className="flex items-center gap-1 px-2 py-1 text-[10px] bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex-shrink-0"
    >
      {installing ? <Loader size={10} className="animate-spin" /> : <Download size={10} />}
      {installing ? 'A instalar...' : 'Instalar'}
    </button>
  )
}

function InstalledList({
  marketplaces,
  loading,
  removing,
  onRemove,
  onBrowse,
}: {
  marketplaces: InstalledMarketplace[]
  loading: boolean
  removing: boolean
  onRemove: (slug: string) => void
  onBrowse: (m: InstalledMarketplace) => void
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-navy-400 text-xs">
        Loading...
      </div>
    )
  }

  if (marketplaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 text-navy-400">
        <ShoppingBag size={28} className="opacity-30" />
        <div className="text-xs text-center">
          <div className="font-medium text-navy-300 mb-1">No marketplaces installed</div>
          <div>Enter a marketplace URL above to browse and install skills or MCP servers.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-navy-300">
        Installed ({marketplaces.length})
      </div>
      {marketplaces.map((m) => (
        <div
          key={m.slug}
          className="rounded-lg bg-navy-700 border border-navy-600 overflow-hidden"
        >
          <div className="flex items-start gap-2 p-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-300 truncate">{m.name}</div>
              <div className="text-[10px] text-navy-400 font-mono truncate mt-0.5">{m.url}</div>
              <div className="text-[9px] text-navy-500 mt-1">
                Added {new Date(m.installedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onBrowse(m)}
                title="Browse"
                className="p-1 text-navy-400 hover:text-gray-300 transition-colors"
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={() => onRemove(m.slug)}
                disabled={removing}
                title="Remove"
                className="p-1 text-navy-400 hover:text-accent-red transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {m.skills && m.skills.length > 0 && (
            <div className="border-t border-navy-600 px-2.5 py-2 flex flex-wrap gap-1">
              {m.skills.map((s) => (
                <span
                  key={s}
                  className="flex items-center gap-0.5 text-[9px] bg-accent-green/10 text-accent-green px-1.5 py-0.5 rounded"
                >
                  <CheckCircle size={8} />
                  {m.slug}-{s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
