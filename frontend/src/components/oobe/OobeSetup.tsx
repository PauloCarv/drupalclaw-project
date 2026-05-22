import { useState, useEffect, useRef } from 'react'
import {
  CheckCircle, Loader2, RefreshCw, ExternalLink, AlertCircle,
  Github, Key, Cloud, Server, Cpu, ChevronRight, Copy,
} from 'lucide-react'
import * as providersApi from '@/api/providers'
import drupalclawIcon from '@/assets/icon.png'

/**
 * OOBE Setup — PiClaw Adaptive Card login via direct commands.
 *
 * Uses internal step routing:
 *   /login                                          → Card 1 (provider list)
 *   /login __step1 {"provider":"X"}                 → Card 2 (OAuth/API key)
 *   /login __step2 {"provider":"X","method":"..."}  → Card 3 (model) or done
 *   /login __step3 {"provider":"X","model":"Y"}     → activate model
 */

type SetupStep = 'checking' | 'loading' | 'pick-provider' | 'waiting-oauth' | 'api-key' | 'custom-config' | 'pick-model' | 'done' | 'error'

interface ProviderInfo {
  id: string
  name: string
  status: string
  methods: string
}

interface OobeSetupProps {
  onComplete: () => void
  /** When true, renders without fullscreen wrapper (for embedding in dialogs) */
  embedded?: boolean
  /** When true, skips the "already configured" check and goes straight to provider list */
  reconfigure?: boolean
}

const PROVIDER_ICONS: Record<string, typeof Github> = {
  'github-copilot': Github,
  'anthropic': Key,
  'openai': Key,
  'openai-codex': Key,
  'google-gemini-cli': Cloud,
  'antigravity': Cloud,
  'azure-openai': Cloud,
  'ollama': Server,
  'openai-compatible': Cpu,
}

export function OobeSetup({ onComplete, embedded = false, reconfigure = false }: OobeSetupProps) {
  const [step, setStep] = useState<SetupStep>('checking')
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')

  // OAuth state
  const [authUrl, setAuthUrl] = useState('')
  const [deviceCode, setDeviceCode] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

  // API Key state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyHint, setApiKeyHint] = useState('')

  // Custom config state
  const [customFields, setCustomFields] = useState<Array<{ key: string; label: string; placeholder: string }>>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  // Model picker state
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([])
  const [selectedModel, setSelectedModel] = useState('')

  const [statusMsg, setStatusMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (reconfigure) {
      // Skip "already configured" check — go straight to provider list
      loadProviders()
    } else {
      checkProviderStatus()
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  // ── Check if already configured ──

  const checkProviderStatus = async () => {
    setStep('checking')
    setError(null)
    try {
      const ready = await providersApi.isProviderReady()
      if (ready) {
        setStep('done')
        setTimeout(onComplete, 1000)
      } else {
        loadProviders()
      }
    } catch {
      loadProviders()
    }
  }

  // ── Load provider list ──
  // We use a static list to avoid sending /login first (which creates a session
  // that causes 409 Conflict when __step1 follows).  If the user picks a
  // provider that doesn't exist, __step1 returns a clear error.

  const KNOWN_PROVIDERS: ProviderInfo[] = [
    { id: 'github-copilot', name: 'GitHub Copilot', status: '', methods: 'OAuth, Token' },
    { id: 'anthropic', name: 'Anthropic (Claude)', status: '', methods: 'API Key' },
    { id: 'openai', name: 'OpenAI', status: '', methods: 'API Key' },
    { id: 'google-gemini-cli', name: 'Google Gemini', status: '', methods: 'OAuth' },
    { id: 'ollama', name: 'Ollama (Local)', status: '', methods: 'Local' },
    { id: 'openai-compatible', name: 'OpenAI-Compatible', status: '', methods: 'API Key, URL' },
    { id: 'azure-openai', name: 'Azure OpenAI', status: '', methods: 'API Key' },
    { id: 'antigravity', name: 'Antigravity', status: '', methods: 'API Key' },
  ]

  const loadProviders = async () => {
    setStep('loading')
    setStatusMsg('Loading providers...')
    try {
      // First try to get the live list from PiClaw
      const result = await providersApi.sendAgentMessage('/login')
      const card = result?.command?.contentBlocks?.[0]

      if (card?.payload) {
        const choiceSet = card.payload.body?.find((b: any) => b.type === 'Input.ChoiceSet')
        if (choiceSet?.choices?.length) {
          const columnSets = (card.payload.body || []).filter((b: any) =>
            b.type === 'ColumnSet' && b.columns?.length === 3 &&
            !b.columns[0]?.items?.[0]?.weight
          )

          const list: ProviderInfo[] = choiceSet.choices.map((c: any) => {
            const row = columnSets.find((cs: any) => cs.columns?.[0]?.items?.[0]?.text === c.title)
            return {
              id: c.value,
              name: c.title,
              status: row?.columns?.[1]?.items?.[0]?.text || '—',
              methods: row?.columns?.[2]?.items?.[0]?.text || '',
            }
          })

          setProviders(list)
          setStep('pick-provider')
          return
        }
      }

      // Fallback to static list
      setProviders(KNOWN_PROVIDERS)
      setStep('pick-provider')
    } catch {
      // On any error (including 409), use static list
      setProviders(KNOWN_PROVIDERS)
      setStep('pick-provider')
    }
  }

  // ── Select provider → send __step1 ──

  const selectProvider = async (providerId: string) => {
    setSelectedProvider(providerId)
    setStep('loading')
    setStatusMsg(`Connecting to ${providers.find(p => p.id === providerId)?.name || providerId}...`)
    setError(null)

    // Helper: send __step1 with retry on 409
    const sendStep1 = async (retries = 3): Promise<any> => {
      const result = await providersApi.sendAgentMessage(
        `/login __step1 ${JSON.stringify({ provider: providerId })}`
      )
      // If apiPost returned a 409 body (not thrown), check __httpStatus
      if (result?.__httpStatus === 409 && retries > 0) {
        await new Promise(r => setTimeout(r, 2000))
        return sendStep1(retries - 1)
      }
      return result
    }

    try {
      // Wait for any previous /login to finish, then send a neutral message
      // to clear any pending command state before __step1
      await new Promise(r => setTimeout(r, 800))
      try { await providersApi.sendAgentMessage('/login __clear') } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 300))

      const result = await sendStep1()

      const command = result?.command
      if (!command) throw new Error('No response')

      if (command.status === 'error') {
        setError(command.message || 'Error')
        setStep('pick-provider')
        return
      }

      const card = command.contentBlocks?.[0]
      if (card?.payload) {
        processCard(card, providerId)
      } else if (command.message) {
        // Direct success message (no card)
        if (command.message.includes('✓') || command.message.includes('activated')) {
          setStep('done')
          setTimeout(onComplete, 1500)
        } else {
          setError(command.message)
          setStep('pick-provider')
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed')
      setStep('pick-provider')
    }
  }

  // ── Process a returned card (OAuth, API key, config, method picker, model picker) ──

  const processCard = (card: any, providerId: string) => {
    const payload = card.payload
    const actions = payload?.actions || []
    const body = payload?.body || []
    const fallback = card.fallback_text || ''

    // OAuth card — has Action.OpenUrl
    const openUrl = actions.find((a: any) => a.type === 'Action.OpenUrl')
    if (openUrl) {
      setAuthUrl(openUrl.url)
      // Extract device code from body text
      const codeBlock = body.find((b: any) => b.text && /code[:\s]/i.test(b.text))
      if (codeBlock) {
        const match = codeBlock.text.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/i)
        if (match) setDeviceCode(match[1])
      }
      // Also check fallback_text for URL
      if (!openUrl.url && fallback) {
        const urlMatch = fallback.match(/https?:\/\/\S+/)
        if (urlMatch) setAuthUrl(urlMatch[0])
      }
      setStep('waiting-oauth')
      startOAuthPolling(providerId)
      return
    }

    // API key card
    const apiKeyField = body.find((b: any) => b.type === 'Input.Text' && b.id === 'api_key')
    if (apiKeyField) {
      setApiKeyHint(apiKeyField.placeholder || 'Enter key...')
      setStep('api-key')
      return
    }

    // Custom config card (multiple Input.Text fields)
    const inputFields = body.filter((b: any) => b.type === 'Input.Text')
    if (inputFields.length > 0) {
      setCustomFields(inputFields.map((f: any) => ({
        key: f.id, label: f.label || f.id, placeholder: f.placeholder || '',
      })))
      const vals: Record<string, string> = {}
      inputFields.forEach((f: any) => { vals[f.id] = f.value || '' })
      setCustomValues(vals)
      setStep('custom-config')
      return
    }

    // Method picker card (ChoiceSet with id="action")
    const methodChoice = body.find((b: any) => b.type === 'Input.ChoiceSet' && b.id === 'action')
    if (methodChoice) {
      const oauthOpt = methodChoice.choices?.find((c: any) => c.value === 'oauth')
      if (oauthOpt) {
        submitMethodChoice(providerId, 'oauth')
      } else {
        submitMethodChoice(providerId, methodChoice.choices?.[0]?.value || '')
      }
      return
    }

    // Model picker card (ChoiceSet with id="model")
    const modelChoice = body.find((b: any) => b.type === 'Input.ChoiceSet' && b.id === 'model')
    if (modelChoice?.choices) {
      setModels(modelChoice.choices.map((c: any) => ({ id: c.value, name: c.title })))
      setSelectedModel(modelChoice.choices[0]?.value || '')
      setStep('pick-model')
      return
    }

    setError('Unexpected card format')
    setStep('error')
  }

  // ── Submit method choice via __step1method ──

  const submitMethodChoice = async (providerId: string, method: string) => {
    setStep('loading')
    setStatusMsg('Loading...')
    try {
      const result = await providersApi.sendAgentMessage(
        `/login __step1method ${JSON.stringify({ provider: providerId, action: method })}`
      )
      const card = result?.command?.contentBlocks?.[0]
      if (card?.payload) {
        processCard(card, providerId)
      } else if (result?.command?.message) {
        handleCommandMessage(result.command)
      }
    } catch (err: any) {
      setError(err.message)
      setStep('pick-provider')
    }
  }

  // ── OAuth polling ──

  const startOAuthPolling = (providerId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => checkOAuth(providerId), 4000)
  }

  const checkOAuth = async (providerId: string) => {
    try {
      const result = await providersApi.sendAgentMessage(
        `/login __step2 ${JSON.stringify({
          provider: providerId,
          method: 'oauth_check',
          redirect_url: redirectUrl || '',
        })}`
      )

      const command = result?.command
      if (!command) return

      // Still waiting
      if (command.status === 'error' && command.message?.includes("didn't complete")) return

      // Success — stop polling
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }

      const card = command.contentBlocks?.[0]
      if (card?.payload) {
        processCard(card, providerId)
      } else {
        handleCommandMessage(command)
      }
    } catch {
      // Keep polling
    }
  }

  const manualOAuthCheck = () => {
    if (selectedProvider) checkOAuth(selectedProvider)
  }

  // ── Submit API key via __step2 ──

  const submitApiKey = async () => {
    if (!apiKeyInput.trim()) return
    setStep('loading')
    setStatusMsg('Saving API key...')
    try {
      const result = await providersApi.sendAgentMessage(
        `/login __step2 ${JSON.stringify({
          provider: selectedProvider,
          method: 'api_key',
          api_key: apiKeyInput.trim(),
        })}`
      )
      const command = result?.command
      const card = command?.contentBlocks?.[0]
      if (card?.payload) {
        processCard(card, selectedProvider)
      } else {
        handleCommandMessage(command)
      }
    } catch (err: any) {
      setError(err.message)
      setStep('api-key')
    }
  }

  // ── Submit custom config via __step2 ──

  const submitConfig = async () => {
    setStep('loading')
    setStatusMsg('Saving configuration...')
    try {
      const result = await providersApi.sendAgentMessage(
        `/login __step2 ${JSON.stringify({
          provider: selectedProvider,
          method: 'configure',
          ...customValues,
        })}`
      )
      handleCommandMessage(result?.command)
    } catch (err: any) {
      setError(err.message)
      setStep('custom-config')
    }
  }

  // ── Submit model via __step3 ──

  const submitModel = async () => {
    if (!selectedModel) return
    setStep('loading')
    setStatusMsg('Activating model...')
    try {
      const result = await providersApi.sendAgentMessage(
        `/login __step3 ${JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
        })}`
      )
      handleCommandMessage(result?.command)
    } catch (err: any) {
      setError(err.message)
      setStep('pick-model')
    }
  }

  // ── Handle a command result message ──

  const handleCommandMessage = (command: any) => {
    if (!command) { setError('No response'); setStep('error'); return }
    const msg = command.message || ''
    if (msg.includes('✓') || msg.includes('Selected model') || msg.includes('activated')) {
      setStep('done')
      setTimeout(onComplete, 1500)
    } else if (command.status === 'error') {
      setError(msg || 'Error')
      setStep('pick-provider')
    } else if (command.contentBlocks?.[0]) {
      processCard(command.contentBlocks[0], selectedProvider)
    } else {
      // Assume success if no error
      setStep('done')
      setTimeout(onComplete, 1500)
    }
  }

  // ── Copy device code ──

  const copyCode = () => {
    navigator.clipboard.writeText(deviceCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2000)
  }

  // ── Render helpers ──

  const providerName = providers.find(p => p.id === selectedProvider)?.name || selectedProvider
  const ProviderIcon = PROVIDER_ICONS[selectedProvider] || Key

  return (
    <div className={embedded ? '' : 'h-screen bg-navy-900 flex items-center justify-center'}>
      <div className={embedded ? 'w-full' : 'max-w-lg w-full mx-4'}>
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={drupalclawIcon}
            alt="DrupalClaw"
            className={`${embedded ? 'w-12 h-12' : 'w-16 h-16'} rounded-2xl object-contain mx-auto mb-4 shadow-lg shadow-drupal-blue/20`}
          />
          <h1 className={`${embedded ? 'text-lg' : 'text-xl'} font-semibold text-white`}>
            {embedded ? 'Provider Setup' : 'DrupalClaw Setup'}
          </h1>
          <p className="text-sm text-navy-300 mt-1">
            {embedded ? 'Change or reconfigure your AI provider' : 'Configure your AI provider to get started'}
          </p>
        </div>

        <div className="bg-navy-700 rounded-xl border border-navy-500 overflow-hidden">

          {/* Loading / Checking */}
          {(step === 'checking' || step === 'loading') && (
            <div className="p-8 text-center">
              <Loader2 className="w-8 h-8 text-ai-teal animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-300">{step === 'checking' ? 'Checking status...' : statusMsg}</p>
            </div>
          )}

          {/* Error */}
          {step === 'error' && (
            <div className="p-6">
              <div className="flex items-start gap-2 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg mb-4">
                <AlertCircle size={14} className="text-accent-red mt-0.5 flex-shrink-0" />
                <p className="text-xs text-accent-red">{error}</p>
              </div>
              <button onClick={loadProviders} className="w-full py-2 bg-navy-600 hover:bg-navy-500 text-sm text-gray-300 rounded-lg">
                Try Again
              </button>
            </div>
          )}

          {/* Pick Provider */}
          {step === 'pick-provider' && (
            <div className="p-5">
              <h2 className="text-sm font-medium text-white mb-3">Select AI Provider</h2>
              {error && (
                <div className="p-2 bg-accent-red/10 border border-accent-red/20 rounded-lg mb-3">
                  <p className="text-[11px] text-accent-red">{error}</p>
                </div>
              )}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {providers.map((p) => {
                  const Icon = PROVIDER_ICONS[p.id] || Key
                  return (
                    <button
                      key={p.id}
                      onClick={() => selectProvider(p.id)}
                      className="w-full flex items-center gap-3 p-2.5 bg-navy-600 hover:bg-navy-500 border border-navy-500 rounded-lg transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-navy-800 flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-gray-300" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <div className="text-sm text-white group-hover:text-ai-teal transition-colors truncate">{p.name}</div>
                        <div className="text-[10px] text-navy-300">{p.methods}</div>
                      </div>
                      {p.status !== '—' && <span className="text-[10px] text-accent-green flex-shrink-0">{p.status}</span>}
                      <ChevronRight size={14} className="text-navy-400 group-hover:text-ai-teal flex-shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Waiting for OAuth */}
          {step === 'waiting-oauth' && (
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full bg-ai-teal/10 flex items-center justify-center mx-auto mb-3">
                  <ProviderIcon size={20} className="text-ai-teal" />
                </div>
                <h2 className="text-sm font-medium text-white">{providerName} — OAuth Login</h2>
              </div>

              {/* Device code */}
              {deviceCode && (
                <div className="bg-navy-800 rounded-lg p-3 mb-3 text-center">
                  <p className="text-[10px] text-navy-300 mb-1">Enter this code on the login page:</p>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-2xl font-mono font-bold text-ai-teal tracking-widest">{deviceCode}</p>
                    <button onClick={copyCode} className="text-navy-300 hover:text-ai-teal" title="Copy code">
                      {codeCopied ? <CheckCircle size={14} className="text-accent-green" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Open URL button */}
              {authUrl && (
                <button
                  onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-drupal-blue hover:bg-drupal-blue-light text-white rounded-lg text-sm font-medium mb-3"
                >
                  <ExternalLink size={14} />
                  Open Login Page
                </button>
              )}

              {/* Redirect URL fallback */}
              <div className="mb-3">
                <label className="text-[10px] text-navy-400 block mb-1">If callback didn't work, paste redirect URL:</label>
                <input
                  type="text" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="http://localhost:..."
                  className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder:text-navy-400 outline-none focus:border-ai-teal"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep('pick-provider') }}
                  className="flex-1 py-2 bg-navy-600 hover:bg-navy-500 text-sm text-gray-300 rounded-lg"
                >
                  Back
                </button>
                <button onClick={manualOAuthCheck} className="flex-1 py-2 bg-ai-teal/20 hover:bg-ai-teal/30 text-sm text-ai-teal rounded-lg">
                  Check & Continue
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 mt-3">
                <Loader2 size={10} className="text-navy-300 animate-spin" />
                <span className="text-[10px] text-navy-300">Auto-checking every 4s...</span>
              </div>
            </div>
          )}

          {/* API Key */}
          {step === 'api-key' && (
            <div className="p-5">
              <h2 className="text-sm font-medium text-white mb-1">{providerName} — API Key</h2>
              <p className="text-[11px] text-navy-300 mb-4">Enter your API key to authenticate.</p>
              <input
                type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={apiKeyHint} autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') submitApiKey() }}
                className="w-full bg-navy-600 border border-navy-500 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-navy-400 outline-none focus:border-ai-teal mb-3"
              />
              <div className="flex gap-2">
                <button onClick={() => setStep('pick-provider')} className="flex-1 py-2 bg-navy-600 hover:bg-navy-500 text-sm text-gray-300 rounded-lg">Back</button>
                <button onClick={submitApiKey} disabled={!apiKeyInput.trim()} className="flex-1 py-2 bg-drupal-blue hover:bg-drupal-blue-light disabled:bg-navy-600 disabled:text-navy-400 text-sm text-white rounded-lg">Save & Continue</button>
              </div>
            </div>
          )}

          {/* Custom Config */}
          {step === 'custom-config' && (
            <div className="p-5">
              <h2 className="text-sm font-medium text-white mb-3">{providerName} — Configuration</h2>
              <div className="space-y-2.5">
                {customFields.map((f) => (
                  <div key={f.key}>
                    <label className="text-[11px] text-navy-300 mb-0.5 block">{f.label}</label>
                    <input
                      type="text" value={customValues[f.key] || ''}
                      onChange={(e) => setCustomValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-navy-600 border border-navy-500 rounded px-2.5 py-1.5 text-sm text-gray-200 placeholder:text-navy-400 outline-none focus:border-ai-teal"
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep('pick-provider')} className="flex-1 py-2 bg-navy-600 hover:bg-navy-500 text-sm text-gray-300 rounded-lg">Back</button>
                <button onClick={submitConfig} className="flex-1 py-2 bg-drupal-blue hover:bg-drupal-blue-light text-sm text-white rounded-lg">Save</button>
              </div>
            </div>
          )}

          {/* Pick Model */}
          {step === 'pick-model' && (
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={14} className="text-accent-green" />
                <h2 className="text-sm font-medium text-white">{providerName} — Select Model</h2>
              </div>
              <p className="text-xs text-accent-green mb-4">Authenticated! {models.length} model{models.length !== 1 ? 's' : ''} available.</p>
              <div className="space-y-1 max-h-48 overflow-y-auto mb-4">
                {models.map((m) => (
                  <button
                    key={m.id} onClick={() => setSelectedModel(m.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedModel === m.id ? 'bg-drupal-blue/20 border border-drupal-blue text-white' : 'bg-navy-600 border border-navy-500 text-gray-300 hover:bg-navy-500'
                    }`}
                  >
                    {m.name || m.id}
                  </button>
                ))}
              </div>
              <button onClick={submitModel} disabled={!selectedModel} className="w-full py-2 bg-drupal-blue hover:bg-drupal-blue-light disabled:bg-navy-600 disabled:text-navy-400 text-sm text-white rounded-lg font-medium">
                Activate Model
              </button>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="p-8 text-center">
              <CheckCircle className="w-10 h-10 text-accent-green mx-auto mb-3" />
              <h2 className="text-sm font-medium text-white mb-1">Provider Configured!</h2>
              <p className="text-xs text-navy-300">Launching DrupalClaw...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {['pick-provider', 'waiting-oauth', 'api-key', 'custom-config'].includes(step) && (
          <div className="flex justify-center gap-4 mt-4">
            <button onClick={checkProviderStatus} className="flex items-center gap-1.5 text-xs text-navy-300 hover:text-ai-teal">
              <RefreshCw size={12} /> Re-check
            </button>
            <button onClick={onComplete} className="text-xs text-navy-400 hover:text-navy-200">Skip for now</button>
          </div>
        )}
      </div>
    </div>
  )
}
