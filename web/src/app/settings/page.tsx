'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import Link from 'next/link'

interface DeviceToken {
  id: string
  token: string
  name: string | null
  expires_at: string
  created_at: string
}

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [deviceTokens, setDeviceTokens] = useState<DeviceToken[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const [generatingToken, setGeneratingToken] = useState(false)
  const [githubLinked, setGithubLinked] = useState<boolean | null>(null)
  const [githubRepo, setGithubRepo] = useState<string | null>(null)
  const [repos, setRepos] = useState<{ full_name: string; private: boolean }[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [unlinkingGithub, setUnlinkingGithub] = useState(false)
  const [selectingRepo, setSelectingRepo] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    getSession()
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
      .select('id, github_repo')
      .single()

    if (!error && data) {
      setGithubLinked(true)
      setGithubRepo(data.github_repo)
      if (data.github_repo === null) {
        fetchRepos()
      }
    } else {
      setGithubLinked(false)
    }
  }

  const fetchRepos = async () => {
    setGithubRepo(null)
    setLoadingRepos(true)
    try {
      const response = await fetch('/api/github/repos')
      if (response.ok) {
        const data = await response.json()
        setRepos(data.repos)
      }
    } finally {
      setLoadingRepos(false)
    }
  }

  const selectRepo = async (repo: string) => {
    setSelectingRepo(true)
    try {
      const response = await fetch('/api/github/select-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
      if (response.ok) {
        setGithubRepo(repo)
        setRepos([])
      } else {
        const error = await response.json()
        alert(error.error || 'Failed to select repo')
      }
    } finally {
      setSelectingRepo(false)
    }
  }

  const unlinkGithub = async () => {
    setUnlinkingGithub(true)
    try {
      const response = await fetch('/api/github/unlink', { method: 'POST' })
      if (response.ok) {
        setGithubLinked(false)
        setGithubRepo(null)
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
      const tokenBytes = new Uint8Array(32)
      crypto.getRandomValues(tokenBytes)
      const token = Array.from(tokenBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              Alfred Voice
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600">Settings</span>
          </div>
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
        {/* GitHub Integration */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">GitHub Integration</h2>
          <p className="text-sm text-gray-600 mb-4">
            Link your GitHub account and select a repo to trigger on-voice.yaml workflow.
          </p>
          {githubLinked === null ? (
            <p className="text-sm text-gray-500">Checking...</p>
          ) : githubLinked ? (
            <div className="space-y-4">
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

              {githubRepo ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Repository:</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-md text-sm font-medium bg-gray-100 text-gray-800">
                    {githubRepo}
                  </span>
                  <button
                    onClick={fetchRepos}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    Change
                  </button>
                </div>
              ) : loadingRepos ? (
                <p className="text-sm text-gray-500">Loading repositories...</p>
              ) : repos.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Repository
                  </label>
                  <select
                    onChange={(e) => selectRepo(e.target.value)}
                    defaultValue=""
                    disabled={selectingRepo}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm disabled:opacity-50"
                  >
                    <option value="" disabled>{selectingRepo ? 'Setting up...' : 'Choose a repository...'}</option>
                    {repos.map((repo) => (
                      <option key={repo.full_name} value={repo.full_name}>
                        {repo.full_name} {repo.private ? '(private)' : ''}
                      </option>
                    ))}
                  </select>
                  {selectingRepo && (
                    <p className="mt-2 text-sm text-gray-500">Setting up ALFRED_TOKEN secret...</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={fetchRepos}
                  className="text-sm text-blue-600 hover:text-blue-500"
                >
                  Select a repository
                </button>
              )}
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

        {/* Device Tokens */}
        <div className="bg-white rounded-lg shadow p-6">
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
      </main>
    </div>
  )
}
