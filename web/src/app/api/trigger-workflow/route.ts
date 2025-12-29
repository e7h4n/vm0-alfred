import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { recording_id } = await request.json()
  if (!recording_id) {
    return NextResponse.json({ error: 'recording_id is required' }, { status: 400 })
  }

  // Verify the recording belongs to this user
  const { data: recording, error: recordingError } = await supabase
    .from('recordings')
    .select('id, user_id')
    .eq('id', recording_id)
    .single()

  if (recordingError || !recording) {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
  }

  if (recording.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Trigger GitHub Actions workflow
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 })
  }

  const response = await fetch(
    'https://api.github.com/repos/e7h4n/vm0-alfred/actions/workflows/on-voice.yaml/dispatches',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          recording_id: recording_id,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('GitHub API error:', response.status, errorText)
    return NextResponse.json(
      { error: 'Failed to trigger workflow' },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true })
}
