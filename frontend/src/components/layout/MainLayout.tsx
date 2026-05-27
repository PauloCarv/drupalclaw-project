import { useRef, useCallback } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { ContextPanel } from './ContextPanel'
import { TabStrip } from './TabStrip'
import { BottomPanel } from './BottomPanel'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { EditorPanel } from '@/components/editor/EditorPanel'
import { DevPanel } from '@/components/devpanel/DevPanel'
import { WatchdogPanel } from '@/components/watchdog/WatchdogPanel'
import { FlowsPanel } from '@/components/flows/FlowsPanel'
import { PlansPanel } from '@/components/plans/PlansPanel'
import { useLayoutStore } from '@/stores/layoutStore'
import { usePlanPolling } from '@/hooks/usePlanPolling'

export function MainLayout() {
  const { sidebarOpen, contextPanelOpen, activeMainTab, bottomPanelOpen, bottomPanelHeight, setBottomPanelHeight } = useLayoutStore()
  usePlanPolling()
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: bottomPanelHeight }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const next = Math.max(80, Math.min(700, dragRef.current.startHeight + delta))
      setBottomPanelHeight(next)
    }

    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [bottomPanelHeight, setBottomPanelHeight])

  const renderOverlayTab = () => {
    switch (activeMainTab) {
      case 'editor':   return <EditorPanel />
      case 'devpanel': return <DevPanel />
      case 'watchdog': return <WatchdogPanel />
      case 'flows':    return <FlowsPanel />
      case 'plans':    return <PlansPanel />
      default:         return null
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-navy-900">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {sidebarOpen && <Sidebar />}

        <div className="flex-1 flex flex-col min-w-0">
          <TabStrip />
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-hidden relative">
              {/* ChatPanel stays always mounted so SSE/useChat never disconnects */}
              <div className={`absolute inset-0 ${activeMainTab === 'chat' ? '' : 'invisible pointer-events-none'}`}>
                <ChatPanel />
              </div>
              {activeMainTab !== 'chat' && (
                <div className="absolute inset-0">
                  {renderOverlayTab()}
                </div>
              )}
            </div>
            {bottomPanelOpen && (
              <>
                {/* Drag handle */}
                <div
                  className="h-1 flex-shrink-0 bg-navy-500 hover:bg-drupal-blue cursor-row-resize transition-colors"
                  onMouseDown={handleResizeStart}
                />
                <div
                  className="flex-shrink-0 overflow-hidden"
                  style={{ height: bottomPanelHeight }}
                >
                  <BottomPanel />
                </div>
              </>
            )}
          </div>
        </div>

        {contextPanelOpen && <ContextPanel />}
      </div>
    </div>
  )
}
