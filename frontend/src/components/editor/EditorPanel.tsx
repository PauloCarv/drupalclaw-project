import { useState, useCallback, useRef, useEffect } from 'react'
import { File, X, Loader2, Save, Check } from 'lucide-react'
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react'
import { useEditorStore } from '@/stores/editorStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { writeFile } from '@/api/files'

const EXT_LANG: Record<string, string> = {
  php: 'php', module: 'php', install: 'php', inc: 'php',
  theme: 'php', profile: 'php', engine: 'php',
  js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  css: 'css', scss: 'scss',
  html: 'html', twig: 'html',
  xml: 'xml',
  sql: 'sql',
  sh: 'shell', bash: 'shell',
  md: 'markdown',
  txt: 'plaintext',
  env: 'shell', ini: 'ini', conf: 'ini',
}

function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANG[ext] ?? 'plaintext'
}

function setupTheme(monaco: any) {
  monaco.editor.defineTheme('drupalclaw', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background':                   '#0A1525', // navy-800
      'editor.lineHighlightBackground':      '#0E1E3066', // navy-700 semi
      'editorLineNumber.foreground':         '#2A4060', // navy-400
      'editorLineNumber.activeForeground':   '#5A7A9A', // navy-300
      'editor.selectionBackground':          '#1A2D44', // navy-500
      'editorCursor.foreground':             '#00B4D8', // ai-teal
      'editorIndentGuide.background1':       '#0E1E30', // navy-700
      'editorIndentGuide.activeBackground1': '#1A2D44', // navy-500
      'editorWidget.background':             '#0E1E30',
      'editorSuggestWidget.background':      '#0E1E30',
      'editorSuggestWidget.border':          '#1A2D44',
      'editorSuggestWidget.selectedBackground': '#1A2D44',
      'input.background':                    '#122236',
      'focusBorder':                         '#00B4D8',
    },
  })
  monaco.editor.setTheme('drupalclaw')
}

export function EditorPanel() {
  const { openFiles, activeFileIndex, setActiveFile, closeFile, updateContent, markSaved } = useEditorStore()
  const fontSize = useSettingsStore((s) => s.fontSize)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize, lineHeight: Math.round(fontSize * 1.55) })
  }, [fontSize])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  // Keep a stable ref so Monaco's addCommand always calls the latest handleSave
  const handleSaveRef = useRef<() => void>(() => {})

  const activeFile = openFiles[activeFileIndex]

  const handleSave = useCallback(async () => {
    // Read directly from store to avoid stale closure
    const { openFiles, activeFileIndex } = useEditorStore.getState()
    const file = openFiles[activeFileIndex]
    if (!file || !file.modified) return
    setSaving(true)
    try {
      await writeFile(file.path, file.content)
      markSaved(file.path)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [markSaved])

  // Always keep the ref current so the Monaco command closure is never stale
  handleSaveRef.current = handleSave

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    setupTheme(monaco)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current()
    })
    editor.focus()
  }, [])

  const handleChange: OnChange = useCallback((value) => {
    const { openFiles, activeFileIndex } = useEditorStore.getState()
    const file = openFiles[activeFileIndex]
    if (file && value !== undefined) {
      updateContent(file.path, value)
    }
  }, [updateContent])

  return (
    <div className="h-full flex flex-col">
      {/* File tabs */}
      <div className="flex bg-navy-800 border-b border-navy-500 overflow-x-auto flex-shrink-0">
        {openFiles.map((file, idx) => (
          <div
            key={file.path}
            onClick={() => setActiveFile(idx)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-navy-500 cursor-pointer flex-shrink-0 ${
              idx === activeFileIndex
                ? 'bg-navy-900 text-gray-200'
                : 'text-navy-300 hover:text-gray-300'
            }`}
          >
            <File size={12} />
            <span>{file.name}</span>
            {file.modified && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-accent-orange flex-shrink-0"
                title="Alterações não guardadas"
              />
            )}
            {file.loading && <Loader2 size={10} className="animate-spin" />}
            <button
              onClick={(e) => { e.stopPropagation(); closeFile(idx) }}
              className="ml-1 hover:text-accent-red transition-colors"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {!activeFile ? (
          <div className="flex-1 flex items-center justify-center text-navy-300 text-sm">
            Abre um ficheiro no explorador
          </div>
        ) : activeFile.loading ? (
          <div className="flex-1 flex items-center justify-center text-navy-300 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" />
            A carregar {activeFile.name}...
          </div>
        ) : (
          <>
            {/* Path + save toolbar */}
            <div className="flex items-center gap-2 px-3 py-1 bg-navy-800 border-b border-navy-600 flex-shrink-0">
              <span className="text-[10px] text-navy-300 flex-1 truncate font-mono">
                {activeFile.path}
              </span>
              {savedFlash && (
                <span className="flex items-center gap-1 text-[10px] text-accent-green">
                  <Check size={10} />
                  Guardado
                </span>
              )}
              {activeFile.modified && !savedFlash && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 text-[10px] bg-drupal-blue hover:bg-drupal-blue-light disabled:opacity-50 text-white px-2 py-0.5 rounded transition-colors flex-shrink-0"
                  title="Guardar (Ctrl+S / ⌘S)"
                >
                  {saving
                    ? <Loader2 size={9} className="animate-spin" />
                    : <Save size={9} />
                  }
                  Guardar
                </button>
              )}
            </div>

            {/* Monaco editor — key forces remount on file switch, preserving per-file cursor state */}
            <div className="flex-1 min-h-0">
              <Editor
                key={activeFile.path}
                height="100%"
                language={getLanguage(activeFile.name)}
                defaultValue={activeFile.content}
                onMount={handleMount}
                onChange={handleChange}
                options={{
                  fontSize,
                  lineHeight: Math.round(fontSize * 1.55),
                  fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'off',
                  renderLineHighlight: 'line',
                  automaticLayout: true,
                  tabSize: 2,
                  insertSpaces: true,
                  padding: { top: 8, bottom: 8 },
                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                  overviewRulerLanes: 0,
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: false, indentation: true },
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
