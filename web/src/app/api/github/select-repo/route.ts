import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { seal } from 'tweetsodium'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { repo } = await request.json()
  if (!repo) {
    return NextResponse.json({ error: 'repo is required' }, { status: 400 })
  }

  // Get user's GitHub token
  const { data: githubData, error: githubError } = await supabase
    .from('github_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .single()

  if (githubError || !githubData) {
    return NextResponse.json({ error: 'GitHub not linked' }, { status: 400 })
  }

  // Generate device token for this repo
  const tokenBytes = new Uint8Array(32)
  crypto.getRandomValues(tokenBytes)
  const deviceToken = Array.from(tokenBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Set expiration to 1 year
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  // Save device token
  const { error: tokenError } = await supabase
    .from('device_tokens')
    .insert({
      user_id: user.id,
      token: deviceToken,
      name: `GitHub Action: ${repo}`,
      expires_at: expiresAt.toISOString(),
    })

  if (tokenError) {
    console.error('Failed to create device token:', tokenError)
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
  }

  // Set GitHub secret
  try {
    // Get repo public key
    const keyResponse = await fetch(
      `https://api.github.com/repos/${repo}/actions/secrets/public-key`,
      {
        headers: {
          'Authorization': `Bearer ${githubData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    )

    if (!keyResponse.ok) {
      const error = await keyResponse.text()
      console.error('Failed to get public key:', error)
      return NextResponse.json({ error: 'Failed to get repo public key' }, { status: 500 })
    }

    const { key, key_id } = await keyResponse.json()

    // Encrypt the token using sealed box
    const publicKey = Buffer.from(key, 'base64')
    const messageBytes = Buffer.from(deviceToken)
    const encryptedBytes = seal(messageBytes, publicKey)
    const encryptedValue = Buffer.from(encryptedBytes).toString('base64')

    // Set the secret
    const secretResponse = await fetch(
      `https://api.github.com/repos/${repo}/actions/secrets/ALFRED_TOKEN`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${githubData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          encrypted_value: encryptedValue,
          key_id: key_id,
        }),
      }
    )

    if (!secretResponse.ok) {
      const error = await secretResponse.text()
      console.error('Failed to set secret:', error)
      return NextResponse.json({ error: 'Failed to set GitHub secret' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error setting GitHub secret:', error)
    return NextResponse.json({ error: 'Failed to set GitHub secret' }, { status: 500 })
  }

  // Update github_tokens with selected repo
  const { error: updateError } = await supabase
    .from('github_tokens')
    .update({ github_repo: repo })
    .eq('user_id', user.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save repo' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
