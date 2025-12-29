import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
