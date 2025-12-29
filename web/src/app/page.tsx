'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useRef } from 'react'
import { User } from '@supabase/supabase-js'

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

interface DeviceToken {
  id: string
  token: string
  name: string | null
  expires_at: string
  created_at: string
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [deviceTokens, setDeviceTokens] = useState<DeviceToken[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [githubLinked, setGithubLinked] = useState<boolean | null>(null)
  const [unlinkingGithub, setUnlinkingGithub] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const supabase = createClient()

  useEffect(() => {
    getSession()
    fetchRecordings()
    checkGithubLink()
    fetchDeviceTokens()
  }, [])

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
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

  const fetchDeviceTokens = async () => {
    const { data, error } = await supabase
      .from('device_tokens')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setDeviceTokens(data)
    }
  }

  const generateDeviceToken = async () => {
    if (!user) return

    setGeneratingToken(true)
    try {
      // Generate a random token
      const tokenBytes = new Uint8Array(32)
      crypto.getRandomValues(tokenBytes)
      const token = Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      // Set expiration to 1 year from now
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      const { error } = await supabase
        .from('device_tokens')
        .insert({
          user_id: user.id,
          token: token,
          name: `Device ${deviceTokens.length + 1}`,
          expires_at: expiresAt.toISOString(),
        })

      if (error) throw error

      setNewToken(token)
      fetchDeviceTokens()
    } catch (error) {
      console.error('Failed to generate token:', error)
      alert('Failed to generate token')
    } finally {
      setGeneratingToken(false)
    }
  }

  const revokeDeviceToken = async (tokenId: string) => {
    const { error } = await supabase
      .from('device_tokens')
      .delete()
      .eq('id', tokenId)

    if (!error) {
      fetchDeviceTokens()
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
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

  const startRecording = async () => {
    if (!user) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const duration = (Date.now() - startTimeRef.current) / 1000
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        await uploadRecording(blob, duration)
      }

      startTimeRef.current = Date.now()
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Failed to access microphone')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const uploadRecording = async (blob: Blob, duration: number) => {
    if (!user) return

    setUploading(true)
    try {
      const timestamp = Date.now()
      const filePath = `user/${user.id}/${timestamp}_recording.webm`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(filePath, blob, { contentType: 'audio/webm' })

      if (uploadError) throw uploadError

      // Create database record with user_id and duration
      const { error: dbError } = await supabase
        .from('recordings')
        .insert({
          file_path: filePath,
          sender: 'user',
          status: 'pending',
          user_id: user.id,
          duration: Math.round(duration),
        })

      if (dbError) throw dbError

      // Refresh list
      fetchRecordings()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Failed to upload')
    } finally {
      setUploading(false)
    }
  }

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
          <h2 className="text-lg font-semibold mb-4">Device Tokens</h2>
          <p className="text-sm text-gray-600 mb-4">
            Generate long-lived tokens (1 year) for your ESP32 devices.
          </p>
          <button
            onClick={generateDeviceToken}
            disabled={generatingToken}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50"
          >
            {generatingToken ? 'Generating...' : 'Generate New Token'}
          </button>

          {newToken && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-green-800">New Token Created!</span>
                <button
                  onClick={() => copyToClipboard(newToken)}
                  className="text-xs text-green-600 hover:text-green-500"
                >
                  Copy
                </button>
              </div>
              <div className="bg-white p-3 rounded-md overflow-x-auto border">
                <code className="text-xs text-gray-800 break-all">{newToken}</code>
              </div>
              <p className="mt-2 text-xs text-amber-600">
                Save this token now! It won&apos;t be shown again.
              </p>
            </div>
          )}

          {deviceTokens.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Active Tokens</h3>
              <ul className="space-y-2">
                {deviceTokens.map((token) => (
                  <li key={token.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <div>
                      <span className="text-sm font-medium text-gray-900">{token.name || 'Unnamed Device'}</span>
                      <p className="text-xs text-gray-500">
                        Expires: {formatDate(token.expires_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeDeviceToken(token.id)}
                      className="text-xs text-red-600 hover:text-red-500"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Record Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Record Voice</h2>
          <div className="flex items-center gap-4">
            {isRecording ? (
              <>
                <button
                  onClick={stopRecording}
                  disabled={uploading}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                  </svg>
                  Stop
                </button>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-lg font-mono text-gray-700">{formatRecordingTime(recordingTime)}</span>
                </div>
              </>
            ) : (
              <button
                onClick={startRecording}
                disabled={uploading}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a3 3 0 00-3 3v5a3 3 0 006 0V5a3 3 0 00-3-3z" />
                  <path d="M5 10a1 1 0 00-2 0 7 7 0 1014 0 1 1 0 10-2 0 5 5 0 01-10 0z" />
                </svg>
                Start Recording
              </button>
            )}
          </div>
          {uploading && <p className="mt-4 text-sm text-gray-500">Uploading...</p>}
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
                        {recording.duration && (
                          <span className="text-xs text-gray-500">
                            {formatRecordingTime(recording.duration)}
                          </span>
                        )}
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
