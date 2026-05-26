'use client'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <html>
      <body style={{ fontFamily: 'system-ui', padding: 48, textAlign: 'center' }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Synthire — Something went wrong</h1>
        <p style={{ color: '#666', marginBottom: 24 }}>{error.message}</p>
        <button
          onClick={reset}
          style={{ padding: '8px 20px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Reload
        </button>
      </body>
    </html>
  )
}
