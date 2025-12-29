'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'

interface Recording {
  id: string
  file_path: string
  duration: number | null
  sender: 'user' | 'ai'
  status: 'pending' | 'processing' | 'done'
  transcript: string | null
  played: boolean
  created_at: string
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [deviceToken, setDeviceToken] = useState<string | null>(null)
  const [githubLinked, setGithubLinked] = useState<boolean | null>(null)
  const [unlinkingGithub, setUnlinkingGithub] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const supabase = createClient()

  useEffect(() => {
    getSession()
    fetchRecordings()
    checkGithubLink()
  }, [])

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setSession(session)
    setUser(session?.user ?? null)
  }

  const checkGithubLink = async () => {
    const { data, error } = await supabase
      .from('github_tokens')
      .select('id')
      .single()

    setGithubLinked(!error && !!data)
  }

  const unlinkGithub = async () => {
    setUnlinkingGithub(true)
    try {
      const response = await fetch('/api/github/unlink', { method: 'POST' })
      if (response.ok) {
        setGithubLinked(false)
      }
    } finally {
      setUnlinkingGithub(false)
    }
  }

  const fetchRecordings = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setRecordings(data)
    }
    setLoading(false)
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      const timestamp = Date.now()
      const filePath = `user/${user.id}/${timestamp}_${file.name}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // Create database record with user_id
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          file_path: filePath,
          sender: 'user',
          status: 'pending',
          user_id: user.id,
        })

      if (dbError) throw dbError

      // Refresh list
      fetchRecordings()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const playRecording = async (recording: Recording) => {
    const { data } = supabase.storage
      .from('recordings')
      .getPublicUrl(recording.file_path)

    if (audioRef.current) {
      audioRef.current.src = data.publicUrl
      audioRef.current.play()
      setPlayingId(recording.id)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const generateDeviceToken = async () => {
    if (!session?.access_token) {
      alert('No session available')
      return
    }
    setDeviceToken(session.access_token)
    setShowToken(true)
  }

  const copyToken = () => {
    if (deviceToken) {
      navigator.clipboard.writeText(deviceToken)
      alert('Token copied to clipboard!')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Alfred Voice</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-sm text-red-600 hover:text-red-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* GitHub Link Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">GitHub Integration</h2>
          <p className="text-sm text-gray-600 mb-4">
            Link your GitHub account to enable workflow triggers when you upload recordings.
          </p>
          {githubLinked === null ? (
            <p className="text-sm text-gray-500">Checking...</p>
          ) : githubLinked ? (
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                GitHub Connected
              </span>
              <button
                onClick={unlinkGithub}
                disabled={unlinkingGithub}
                className="text-sm text-red-600 hover:text-red-500 disabled:opacity-50"
              >
                {unlinkingGithub ? 'Unlinking...' : 'Unlink'}
              </button>
            </div>
          ) : (
            <a
              href="/api/github/authorize"
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 text-sm font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Link GitHub
            </a>
          )}
        </div>

        {/* Device Token Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Device Token</h2>
          <p className="text-sm text-gray-600 mb-4">
            Generate a token for your ESP32 device to upload recordings.
          </p>
          <button
            onClick={generateDeviceToken}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
          >
            Generate Device Token
          </button>

          {showToken && deviceToken && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700">Access Token:</span>
                <button
                  onClick={copyToken}
                  className="text-xs text-blue-600 hover:text-blue-500"
                >
                  Copy
                </button>
              </div>
              <div className="bg-gray-100 p-3 rounded-md overflow-x-auto">
                <code className="text-xs text-gray-800 break-all">{deviceToken}</code>
              </div>
              <p className="mt-2 text-xs text-amber-600">
                Note: This token expires. You may need to regenerate it periodically.
              </p>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Upload Recording</h2>
          <label className="block">
            <span className="sr-only">Choose audio file</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
            />
          </label>
          {uploading && <p className="mt-2 text-sm text-gray-500">Uploading...</p>}
        </div>

        {/* Recordings List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Conversations</h2>
          </div>

          {loading ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : recordings.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No recordings yet</div>
          ) : (
            <ul className="divide-y">
              {recordings.map((recording) => (
                <li key={recording.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          recording.sender === 'user'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {recording.sender === 'user' ? 'You' : 'AI'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          recording.status === 'done'
                            ? 'bg-gray-100 text-gray-800'
                            : recording.status === 'processing'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {recording.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(recording.created_at)}
                        </span>
                      </div>
                      {recording.transcript && (
                        <p className="mt-2 text-sm text-gray-700">{recording.transcript}</p>
                      )}
                    </div>
                    <button
                      onClick={() => playRecording(recording)}
                      className={`ml-4 p-2 rounded-full ${
                        playingId === recording.id
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                      </svg>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <audio
          ref={audioRef}
          onEnded={() => setPlayingId(null)}
          className="hidden"
        />
      </main>
    </div>
  )
}
