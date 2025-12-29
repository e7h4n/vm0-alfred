import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/?github_error=${error}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/?github_error=missing_params`)
  }

  const supabase = await createClient()

  // Verify user is authenticated and matches state
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user || user.id !== state) {
    return NextResponse.redirect(`${origin}/login?error=auth_mismatch`)
  }

  // Exchange code for access token
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?github_error=not_configured`)
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.error) {
    return NextResponse.redirect(`${origin}/?github_error=${tokenData.error}`)
  }

  // Store token in database (upsert)
  const { error: dbError } = await supabase
    .from('github_tokens')
    .upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'bearer',
      scope: tokenData.scope,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    })

  if (dbError) {
    console.error('Failed to store GitHub token:', dbError)
    return NextResponse.redirect(`${origin}/?github_error=storage_failed`)
  }

  return NextResponse.redirect(`${origin}/?github_linked=true`)
}
