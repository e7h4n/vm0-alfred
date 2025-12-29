import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user's GitHub token
  const { data: tokenData, error: tokenError } = await supabase
    .from('github_tokens')
    .select('access_token')
    .eq('user_id', user.id)
    .single()

  if (tokenError || !tokenData) {
    return NextResponse.json({ error: 'GitHub not linked' }, { status: 400 })
  }

  // Fetch repos from GitHub
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch repos' }, { status: 500 })
  }

  const repos = await response.json()

  // Return simplified repo list
  const repoList = repos.map((repo: { full_name: string; private: boolean }) => ({
    full_name: repo.full_name,
    private: repo.private,
  }))

  return NextResponse.json({ repos: repoList })
}
