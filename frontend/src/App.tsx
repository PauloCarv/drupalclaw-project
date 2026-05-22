import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { OobeSetup } from '@/components/oobe/OobeSetup'
import * as providersApi from '@/api/providers'
import { getTimeline, postMessage } from '@/api/chat'

export default function App() {
  const [oobeComplete, setOobeComplete] = useState<boolean | null>(null) // null = checking

  useEffect(() => {
    checkOobe()
  }, [])

  const checkOobe = async () => {
    const ready = await providersApi.isProviderReady()
    setOobeComplete(ready)
  }

  const handleOobeComplete = async () => {
    // On fresh install (empty timeline), trigger agent onboarding automatically
    try {
      const posts = await getTimeline(10)
      const hasRealMessages = posts.some(p =>
        p.data?.type === 'user_message' &&
        !String(p.data?.content ?? '').startsWith('/login')
      )
      if (!hasRealMessages) {
        await postMessage('Hello! I just set up DrupalClaw.')
      }
    } catch {
      // Non-critical — proceed to main app regardless
    }
    setOobeComplete(true)
  }

  // Still checking
  if (oobeComplete === null) {
    return (
      <div className="h-screen bg-navy-900 flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-drupal-blue flex items-center justify-center text-lg font-bold text-white animate-pulse">
          DC
        </div>
      </div>
    )
  }

  // OOBE not done — show setup
  if (!oobeComplete) {
    return <OobeSetup onComplete={handleOobeComplete} />
  }

  // Ready — show main app
  return <MainLayout />
}
