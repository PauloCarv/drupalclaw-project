import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { OobeSetup } from '@/components/oobe/OobeSetup'
import * as providersApi from '@/api/providers'

export default function App() {
  const [oobeComplete, setOobeComplete] = useState<boolean | null>(null) // null = checking

  useEffect(() => {
    checkOobe()
  }, [])

  const checkOobe = async () => {
    const ready = await providersApi.isProviderReady()
    setOobeComplete(ready)
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
    return <OobeSetup onComplete={() => setOobeComplete(true)} />
  }

  // Ready — show main app
  return <MainLayout />
}
