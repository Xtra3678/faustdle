import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const discordClientId = '1351722811718373447'
const discordClientSecret = Deno.env.get('DISCORD_CLIENT_SECRET')
const redirectUri = Deno.env.get('DISCORD_REDIRECT_URI') || 'https://discordsays.com'

serve(async (req) => {
  console.log('discord-token-exchange called:', req.method)
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method)
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    console.log('Request body received:', body)
    const { code } = body

    if (!code) {
      console.log('No code in request')
      return new Response(JSON.stringify({ error: 'Missing authorization code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!discordClientSecret) {
      console.error('DISCORD_CLIENT_SECRET is not set')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('Exchanging code for token...')
    // Exchange code for access token
    // Must use application/x-www-form-urlencoded per Discord docs
    const params = new URLSearchParams({
      client_id: discordClientId,
      client_secret: discordClientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
    })

    console.log('Posting to Discord token endpoint with params:', {
      client_id: discordClientId,
      grant_type: 'authorization_code',
      has_client_secret: !!discordClientSecret,
      has_code: !!code,
      redirect_uri: redirectUri,
    })

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    console.log('Token response status:', tokenResponse.status)

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Discord token exchange failed:', errorData)
      return new Response(JSON.stringify({ error: 'Token exchange failed', details: errorData }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tokenData = await tokenResponse.json()
    console.log('Token exchange successful')
    console.log('Token response data keys:', Object.keys(tokenData))
    console.log('Access token present:', !!tokenData.access_token)
    console.log('Token type:', tokenData.token_type)
    console.log('Expires in:', tokenData.expires_in)
    console.log('Scopes:', tokenData.scope)

    // Fetch user info with the access token
    console.log('Fetching user info with access token...')
    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    })

    console.log('User info response status:', userResponse.status)
    let user = null
    
    if (userResponse.ok) {
      user = await userResponse.json()
      console.log('User info retrieved:', {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
      })
    } else {
      console.error('Failed to fetch user info:', userResponse.status)
    }

    return new Response(JSON.stringify({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      refresh_token: tokenData.refresh_token,
      user: user,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    console.error('Error in discord-token-exchange:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
