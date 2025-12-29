'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'

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
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
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

    const channel = supabase
      .channel('recordings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recordings',
        },
        () => {
          fetchRecordings()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('No access token')
      }

      const formData = new FormData()
      formData.append('file', blob, `recording_${Date.now()}.webm`)

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-recording`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

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

      await supabase
        .from('recordings')
        .update({ status: 'done', played: true })
        .eq('id', recording.id)
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
            <Link
              href="/settings"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Settings
            </Link>
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
