import { useDockerStats } from '@/hooks/useDockerStats'
import { RefreshCw } from 'lucide-react'

function StateIndicator({ state }: { state: string }) {
  if (state === 'running') {
    return <span className="inline-block w-2 h-2 rounded-full bg-accent-green mr-1.5 flex-shrink-0" title="running" />
  }
  if (state === 'paused') {
    return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 flex-shrink-0" title="paused" />
  }
  return <span className="inline-block w-2 h-2 rounded-full bg-accent-red mr-1.5 flex-shrink-0" title={state} />
}

export function DockerPanel() {
  const { containers, loading, restart, stop, start, refresh } = useDockerStats()

  return (
    <div className="h-full w-full flex flex-col bg-[#0A1525] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-navy-800 border-b border-navy-600 flex-shrink-0">
        <span className="text-[9px] uppercase tracking-wider text-navy-500">Containers</span>
        <button
          title="Refresh"
          onClick={refresh}
          className="ml-auto text-navy-400 hover:text-gray-300 transition-colors p-0.5"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 text-[11px] text-navy-400 font-mono">a carregar...</div>
        ) : containers.length === 0 ? (
          <div className="p-3 text-[11px] text-navy-400 font-mono">nenhum container encontrado</div>
        ) : (
          <table className="w-full text-[10px] font-mono border-collapse">
            <thead>
              <tr className="text-[9px] text-navy-500 uppercase tracking-wider border-b border-navy-700">
                <th className="text-left px-2 py-1 font-normal w-1/2">container</th>
                <th className="text-left px-2 py-1 font-normal">status</th>
                <th className="text-right px-2 py-1 font-normal">acções</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c.name} className="border-b border-navy-700/50 hover:bg-navy-800/40 transition-colors">
                  <td className="px-2 py-1.5">
                    <span className="text-gray-200 truncate block max-w-[180px]" title={c.name}>
                      {c.name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center">
                      <StateIndicator state={c.state} />
                      <span
                        className="text-navy-300 truncate max-w-[160px]"
                        title={c.status}
                      >
                        {c.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        title="Restart"
                        onClick={() => restart(c.name)}
                        className="px-1.5 py-0.5 rounded border border-navy-600 bg-navy-700 hover:bg-navy-600 text-navy-300 hover:text-yellow-400 transition-colors"
                      >
                        restart
                      </button>
                      {c.state === 'running' ? (
                        <button
                          title="Stop"
                          onClick={() => stop(c.name)}
                          className="px-1.5 py-0.5 rounded border border-navy-600 bg-navy-700 hover:bg-navy-600 text-navy-300 hover:text-accent-red transition-colors"
                        >
                          stop
                        </button>
                      ) : (
                        <button
                          title="Start"
                          onClick={() => start(c.name)}
                          className="px-1.5 py-0.5 rounded border border-navy-600 bg-navy-700 hover:bg-navy-600 text-navy-300 hover:text-accent-green transition-colors"
                        >
                          start
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
