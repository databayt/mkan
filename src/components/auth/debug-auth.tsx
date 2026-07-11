"use client"
// i18n-exempt-file — dev-only auth debug panel (returns null in production);
// never shown to end users.

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

export default function DebugAuth() {
  const { data: session, status } = useSession()
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    const addLog = (message: string) => {
      setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
    }

    addLog(`Session status: ${status}`)
    if (session) {
      addLog(`User authenticated: ${session.user?.email}`)
      addLog(`User ID: ${session.user?.id}`)
      addLog(`User role: ${session.user?.role}`)
    } else {
      addLog('No session found')
    }
  }, [session, status])

  if (process.env.NODE_ENV === 'production') {
    return null // Don't show in production
  }

  return (
    <div className="fixed bottom-4 end-4 bg-black text-green-400 p-4 rounded-lg max-w-md max-h-64 overflow-auto text-xs font-mono z-50">
      <div className="font-bold mb-2">🔍 Auth Debug</div>
      <div className="mb-2">
        <span>Status: </span>
        <span className={status === 'loading' ? 'text-yellow-400' : status === 'authenticated' ? 'text-green-400' : 'text-red-400'}>
          {status}
        </span>
      </div>
      {session && (
        <div className="mb-2">
          <div>User: {session.user?.email}</div>
          <div>ID: {session.user?.id}</div>
          <div>Role: {session.user?.role}</div>
        </div>
      )}
      <div className="border-t border-gray-600 pt-2">
        <div className="font-bold mb-1">Logs:</div>
        {logs.slice(-5).map((log, i) => (
          <div key={i} className="text-xs">{log}</div>
        ))}
      </div>
    </div>
  )
} 