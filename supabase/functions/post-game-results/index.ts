import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const discordAppLink = 'https://discord.com/activities/1351722811718373447?referrer_id=256228859110752257'

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qrprexuziojupqvvdefy.supabase.co'
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')

const supabase = createClient(supabaseUrl, supabaseKey!)

/**
 * Store first message ID and timestamp for a channel/date combo
 * Used to track when to send the 24-hour reminder
 */
async function storeFirstMessage(channelId: string, date: string, messageId: string, webhookUrl?: string, streakCount?: number) {
  if (!messageId || !channelId || !date) {
    console.warn('⚠️ storeFirstMessage: Missing required parameters', { messageId: !!messageId, channelId, date })
    return
  }

  try {
    const cacheKey = `${channelId}:${date}`
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('discord_interaction_tokens')
      .update({
        first_message_id: messageId,
        first_message_timestamp: now,
        reminder_sent: false,
        reminder_webhook_url: webhookUrl || null,
        current_streak_count: streakCount || 1
      })
      .eq('cache_key', cacheKey)

    if (error) {
      console.error('⚠️ Failed to store first message:', error.message)
    } else {
      console.log(`✅ Stored first message for ${channelId}:${date} - messageId: ${messageId}, streak: ${streakCount || 1}`)
    }
  } catch (err: any) {
    console.error('⚠️ storeFirstMessage error:', err.message)
  }
}

/**
 * Check if a channel/date has a first message recorded
 */
async function hasFirstMessage(channelId: string, date: string): Promise<boolean> {
  const cacheKey = `${channelId}:${date}`

  try {
    const { data, error } = await supabase
      .from('discord_interaction_tokens')
      .select('first_message_id')
      .eq('cache_key', cacheKey)
      .maybeSingle()

    if (error) {
      console.error(`⚠️ hasFirstMessage: Database error:`, error.message)
      return false
    }

    return !!data?.first_message_id
  } catch (err: any) {
    console.error(`⚠️ hasFirstMessage error:`, err.message)
    return false
  }
}

/**
 * Calculate the current streak for a channel
 * Checks if yesterday had results + increments streak, or resets to 1
 */
async function calculateStreakForChannel(channelId: string, today: string): Promise<number> {
  try {
    // Get yesterday's date
    const todayDate = new Date(today)
    const yesterdayDate = new Date(todayDate)
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1)
    const yesterday = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getUTCDate()).padStart(2, '0')}`

    // Check if yesterday has results for this channel
    const { data: yesterdayResults, error: yesterdayError } = await supabase
      .from('daily_results')
      .select('id')
      .eq('channel_id', channelId)
      .eq('game_date', yesterday)
      .limit(1)

    if (yesterdayError) {
      console.error(`⚠️ Error checking yesterday results:`, yesterdayError.message)
      return 1 // Default to 1 if we can't check
    }

    // If yesterday had results, get yesterday's streak count and increment it
    if (yesterdayResults && yesterdayResults.length > 0) {
      const yesterdayCacheKey = `${channelId}:${yesterday}`
      const { data: yesterdayEntry, error: getError } = await supabase
        .from('discord_interaction_tokens')
        .select('current_streak_count')
        .eq('cache_key', yesterdayCacheKey)
        .maybeSingle()

      if (getError || !yesterdayEntry) {
        console.warn(`⚠️ Could not get yesterday's streak, starting fresh`)
        return 1
      }

      const newStreak = (yesterdayEntry.current_streak_count || 1) + 1
      console.log(`📈 Streak continues: ${yesterdayEntry.current_streak_count} → ${newStreak}`)
      return newStreak
    } else {
      // No results yesterday = streak broken or new
      console.log(`🔄 New streak started (no results yesterday)`)
      return 1
    }
  } catch (err: any) {
    console.error(`⚠️ calculateStreakForChannel error:`, err.message)
    return 1
  }
}

/**
 * Create a persistent webhook in the channel for reminder messages
 * This webhook can be used after the interaction token expires
 */
async function createWebhook(channelId: string, botToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/webhooks`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Faustdle Daily Reminders',
          avatar: null
        })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error(`⚠️ Failed to create webhook: ${response.status} - ${error}`)
      return null
    }

    const webhookData = await response.json()
    const webhookUrl = `https://discord.com/api/v10/webhooks/${webhookData.id}/${webhookData.token}`
    console.log(`✅ Created webhook for channel ${channelId}`)
    return webhookUrl
  } catch (err: any) {
    console.error(`⚠️ createWebhook error:`, err.message)
    return null
  }
}

/**
 * Store an interaction token and message ID in the database
 * Tokens expire after 15 minutes (Discord interaction token limit)
 */
async function storeToken(channelId: string, date: string, token: string, messageId?: string) {
  if (!token || !channelId || !date) {
    console.warn('⚠️ storeToken: Missing required parameters', { token: !!token, channelId, date })
    return
  }
  
  try {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
    
    const { error } = await supabase
      .from('discord_interaction_tokens')
      .upsert({
        cache_key: `${channelId}:${date}`,
        channel_id: channelId,
        game_date: date,
        interaction_token: token,
        message_id: messageId || null,
        expires_at: expiresAt,
        created_at: new Date().toISOString()
      }, {
        onConflict: 'cache_key'
      })
    
    if (error) {
      console.error('⚠️ Failed to store token in database:', error.message)
    } else {
      console.log(`✅ Stored token for ${channelId}:${date}${messageId ? ` with messageId: ${messageId}` : ' (messageId: pending)'}`)
    }
  } catch (err: any) {
    console.error('⚠️ storeToken error:', err.message)
  }
}

/**
 * Retrieve a cached token from the database
 */
async function getToken(channelId: string, date: string): Promise<string | null> {
  const cacheKey = `${channelId}:${date}`
  
  try {
    const { data, error } = await supabase
      .from('discord_interaction_tokens')
      .select('interaction_token, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle()
    
    if (error) {
      console.error(`⚠️ getToken: Database error for ${cacheKey}:`, error.message)
      return null
    }
    
    if (!data) {
      console.log(`⚠️ getToken: No token found for ${cacheKey}`)
      return null
    }
    
    if (new Date(data.expires_at) < new Date()) {
      console.log(`⏰ getToken: Token expired for ${cacheKey}`)
      return null
    }
    
    console.log(`✅ getToken: Retrieved valid token for ${cacheKey}`)
    return data.interaction_token
  } catch (err: any) {
    console.error(`⚠️ getToken error for ${cacheKey}:`, err.message)
    return null
  }
}

/**
 * Retrieve a cached message ID from the database
 */
async function getMessageId(channelId: string, date: string): Promise<string | null> {
  const cacheKey = `${channelId}:${date}`
  
  try {
    const { data, error } = await supabase
      .from('discord_interaction_tokens')
      .select('message_id, expires_at')
      .eq('cache_key', cacheKey)
      .maybeSingle()
    
    if (error) {
      console.error(`⚠️ getMessageId: Database error for ${cacheKey}:`, error.message)
      return null
    }
    
    if (!data) {
      console.log(`⚠️ getMessageId: No entry found for ${cacheKey}`)
      return null
    }
    
    if (new Date(data.expires_at) < new Date()) {
      console.log(`⏰ getMessageId: Entry expired for ${cacheKey}`)
      return null
    }
    
    if (!data.message_id) {
      console.log(`⏱️ getMessageId: Message ID not yet available for ${cacheKey}`)
      return null
    }
    
    console.log(`✅ getMessageId: Found message ID for ${cacheKey}`)
    return data.message_id
  } catch (err: any) {
    console.error(`⚠️ getMessageId error for ${cacheKey}:`, err.message)
    return null
  }
}

/**
 * Update activity tracking for a channel/date combo
 * Tracks when the activity was last updated and member count
 */
/**
 * Verify Discord interaction signature using Ed25519
 */
async function verifyDiscordSignature(signature: string, timestamp: string, body: string, publicKey: string): Promise<boolean> {
  if (!signature || !timestamp || !publicKey) {
    console.log('Missing signature, timestamp, or public key')
    return false
  }

  try {
    // Convert hex strings to bytes
    const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)))
    const publicKeyBytes = new Uint8Array(publicKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)))

    if (publicKeyBytes.length !== 32) {
      console.error('Invalid public key length:', publicKeyBytes.length)
      return false
    }

    // Message to verify is timestamp + body
    const messageToVerify = `${timestamp}${body}`
    const encoder = new TextEncoder()
    const messageBytes = encoder.encode(messageToVerify)

    // Use Web Crypto API to verify Ed25519 signature
    const publicKeyObj = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
      false,
      ['verify']
    )

    const isValid = await crypto.subtle.verify(
      'Ed25519' as any,
      publicKeyObj,
      signatureBytes,
      messageBytes
    )

    console.log('Signature verification result:', isValid)
    return isValid
  } catch (error: any) {
    console.error('Signature verification error:', error.message)
    return false
  }
}

serve(async (req) => {
  console.log('=== Request received ===')
  console.log('Method:', req.method)
  
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, X-Signature-Ed25519, X-Signature-Timestamp',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Read raw body FIRST
    const rawBody = await req.text()
    console.log('Raw body length:', rawBody.length)

    let data
    try {
      data = JSON.parse(rawBody)
    } catch (e: any) {
      console.error('Failed to parse JSON:', e.message)
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get signature headers
    const signature = req.headers.get('X-Signature-Ed25519')
    const timestamp = req.headers.get('X-Signature-Timestamp')
    const publicKey = Deno.env.get('DISCORD_PUBLIC_KEY')

    console.log('Signature present:', !!signature)
    console.log('Timestamp present:', !!timestamp)
    console.log('Public key configured:', !!publicKey)
    console.log('Interaction type:', data.type)

    // If we have Discord headers, verify the signature
    if (signature && timestamp) {
      if (!publicKey) {
        console.error('DISCORD_PUBLIC_KEY not configured in environment')
        console.error('Available env vars:', Object.keys(Deno.env.toObject()).filter(k => k.includes('DISCORD')))
        return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log('Verifying Discord signature...')
      const isValid = await verifyDiscordSignature(signature, timestamp, rawBody, publicKey)

      if (!isValid) {
        console.error('Invalid Discord signature - rejecting request')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      console.log('✓ Signature verified')
    } else {
      console.log('No Discord signature headers - treating as internal request')
    }

    // Handle PING (type 1) - Discord verification
    if (data.type === 1) {
      console.log('✓ PING received - responding with PONG')
      return new Response(JSON.stringify({ type: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Handle APPLICATION_COMMAND interaction (type 2)
    if (data.type === 2) {
      console.log('✓ APPLICATION_COMMAND interaction received')
      const userId = data.member?.user?.id || data.user?.id || data.user_id
      const channelId = data.channel_id
      const commandName = data.data?.name
      const interactionToken = data.token // Extract the interaction token from Discord
      
      console.log('Extracted user info:', {
        userId,
        channelId,
        commandName,
        hasToken: !!interactionToken,
        fromMember: !!data.member?.user?.id,
        fromUser: !!data.user?.id,
      })
      
      // Log the entire data object to debug
      console.log('Full interaction data keys:', Object.keys(data).sort())
      console.log('data.channel_id:', data.channel_id)
      console.log('data.guild_id:', data.guild_id)
      console.log('typeof channelId:', typeof channelId)
      
      // Handle /faustdle entry point command
      if (commandName === 'faustdle' || commandName === 'faustdle-test') {
        console.log('✓ Handling /faustdle entry point command')
        
        if (!userId || !channelId) {
          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: '❌ Could not identify user or channel',
              flags: 64
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          // Get today's date in UTC
          const now = new Date();
          const utcYear = now.getUTCFullYear();
          const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
          const utcDay = String(now.getUTCDate()).padStart(2, '0');
          const today = `${utcYear}-${utcMonth}-${utcDay}`
          
          // Store the interaction token for later use in edits
          if (interactionToken) {
            await storeToken(channelId, today, interactionToken)
          }
          
          console.log('Entry point: Checking for existing entry for channel:', {
            userId,
            channelId,
            today
          })
          
          // Check if entry already exists
          const { data: existingEntry, error: checkError } = await supabase
            .from('daily_results')
            .select('id')
            .eq('user_id', userId)
            .eq('channel_id', channelId)
            .eq('game_date', today)
            .maybeSingle()
          
          if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking for existing entry:', checkError)
          }
          
          // Only insert if entry doesn't exist
          if (!existingEntry) {
            console.log('No existing entry, creating blank entry with INSERT')
            
            const insertData = {
              user_id: userId,
              channel_id: channelId,
              game_date: today,
              emoji_grid: '', // Start with blank
              time_taken: '', // Start with blank
              created_at: new Date().toISOString()
            }
            
            console.log('About to insert with data:', insertData)
            
            const { error: insertError } = await supabase
              .from('daily_results')
              .insert([insertData])
            
            if (insertError) {
              console.error('Error creating entry:', insertError)
              // Don't fail the command if insert fails - entry might have been created by another process
            } else {
              console.log('Entry created successfully')
            }
          } else {
            console.log('Entry already exists, skipping creation')
          }
          
          console.log('Entry point: User entry ready')
          
          // Now get all players in this activity session (same channel_id and game_date)
          const { data: allPlayers, error: playersError } = await supabase
            .from('daily_results')
            .select('user_id, emoji_grid, time_taken')
            .eq('channel_id', channelId)
            .eq('game_date', today)
          
          if (playersError) {
            console.error('Error fetching players:', playersError)
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: '❌ Failed to fetch player data',
                flags: 64
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          // Build embed with all players' results
          const fields = allPlayers && allPlayers.length > 0 
            ? allPlayers.map(player => ({
                name: '',
                value: `<@${player.user_id}>\n\nTime: ${player.time_taken || '⏳ playing'}\n\`\`\`\n${player.emoji_grid || '⏳ started'}\n\`\`\``,
                inline: false
              }))
            : [{
                name: 'Starting...',
                value: 'Activity initialized',
                inline: false
              }]

          const embed = {
            title: 'Faustdle Daily Challenge',
            description: `Activity in progress - 1 member(s) connected`,
            color: 15195009, // Golden yellow color
            fields,
            footer: {
              text: 'Shared from Faustdle'
            },
            timestamp: new Date().toISOString()
          }

          // For entry point commands, launch the activity and send the embed as a follow-up
          if (commandName === 'faustdle') {
            // Return LAUNCH_ACTIVITY immediately
            const launchResponse = new Response(JSON.stringify({
              type: 12, // LAUNCH_ACTIVITY
              data: {}
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })

            // Then send a follow-up message with the embed
            if (interactionToken) {
              const appId = '1351722811718373447' // Faustdle app ID
              const followUpUrl = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}?wait=true`
              
              // Send follow-up message and capture the message ID (critical for real-time updates)
              // We use a background fetch with proper error handling
              // Note: Webhook endpoints with interaction tokens don't need a Bot token
              fetch(followUpUrl, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  embeds: [embed],
                  components: [
                    {
                      type: 1,
                      components: [
                        {
                          type: 2,
                          style: 5,
                          label: 'Play Now!',
                          url: 'https://discord.com/activities/1351722811718373447'
                        }
                      ]
                    }
                  ]
                })
              }).then(async response => {
                if (response.ok) {
                  try {
                    const responseText = await response.text()
                    const messageData = JSON.parse(responseText)
                    
                    if (messageData.id) {
                      // Store token AND message ID for real-time updates
                      await storeToken(channelId, today, interactionToken, messageData.id)
                      
                      // Check if this is the first message of the day for this channel
                      const isFirst = !await hasFirstMessage(channelId, today)
                      if (isFirst) {
                        // Store as first message for 24-hour reminder
                        // Also store the webhook URL (interaction token webhook) for reminder function to use within 15-minute window
                        const appId = '1351722811718373447'
                        const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`
                        
                        // Calculate the current streak
                        const streakCount = await calculateStreakForChannel(channelId, today)
                        
                        await storeFirstMessage(channelId, today, messageData.id, webhookUrl, streakCount)
                        console.log('✅ Stored as first message of the day with webhook URL and streak count')
                      }
                      
                      console.log('✓ Follow-up message sent successfully, ID:', messageData.id)
                    } else {
                      console.warn('⚠️ Follow-up message response missing ID field:', Object.keys(messageData))
                      // Still store token for fallback, but without messageId
                      await storeToken(channelId, today, interactionToken, undefined)
                    }
                  } catch (parseErr: any) {
                    console.error('❌ Failed to parse follow-up message response:', parseErr.message)
                    await storeToken(channelId, today, interactionToken, undefined)
                  }
                } else {
                  const errorText = await response.text()
                  console.error('❌ Failed to send follow-up message:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                  })
                }
              }).catch(err => {
                console.error('❌ Follow-up fetch error:', err.message)
              })
            }

            return launchResponse
          }

          // For test commands, return the embed immediately
          return new Response(JSON.stringify({
            type: 4,
            data: { 
              embeds: [embed],
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 5,
                      label: 'Play Now!',
                      url: 'https://discord.com/activities/1351722811718373447'
                    }
                  ]
                }
              ]
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('Error in entry point command:', error)
          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: `❌ Error: ${error.message}`,
              flags: 64
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      // Handle /share command (existing logic)
      if (commandName === 'share') {
        console.log('✓ Handling /share command')
        
        if (!userId) {
          console.error('Failed to extract user ID from interaction')
          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: '❌ Could not identify user',
              flags: 64
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          // Get today's date in UTC (YYYY-MM-DD format) - SAME LOGIC as DailyResultsStorage.js
          const now = new Date();
          const utcYear = now.getUTCFullYear();
          const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
          const utcDay = String(now.getUTCDate()).padStart(2, '0');
          const today = `${utcYear}-${utcMonth}-${utcDay}`
          
          console.log('Query: Getting results for user:', {
            userId,
            today,
            actualUTC: now.toISOString(),
            userIdType: typeof userId
          })
          
          // Query database for user's daily results
          // If multiple rows exist for same user/date, get the one with oldest created_at
          const { data: queryDataArray, error: queryError } = await supabase
            .from('daily_results')
            .select('emoji_grid, time_taken')
            .eq('user_id', userId)
            .eq('game_date', today)
            .order('created_at', { ascending: true })
            .limit(1)

          if (queryError) {
            console.error('Database query error:', {
              code: queryError.code,
              message: queryError.message,
              details: queryError.details,
              hint: queryError.hint
            })
            
            // Return error details in Discord message
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: `❌ Database query failed for user ${userId} on ${today}\n\`\`\`\nError: ${queryError.code}\nMessage: ${queryError.message}\nDetails: ${queryError.details || 'none'}\n\`\`\``,
                flags: 64
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const queryData = queryDataArray && queryDataArray.length > 0 ? queryDataArray[0] : null

          if (!queryData) {
            // No results found for today
            console.log('No results found for user', userId, 'on date', today)
            return new Response(JSON.stringify({
              type: 4,
              data: {
                content: `<@${userId}> hasn't completed the daily challenge yet on ${today}. Go play in [Faustdle](<https://faustdle.com>)!`,
                flags: 64
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          // Results found, format the message with embed
          console.log('Found results for user:', {
            userId,
            date: today,
            gridLength: queryData.emoji_grid?.length,
            timeTaken: queryData.time_taken
          })

          // Create an embed
          const embed = {
            title: 'Faustdle Daily Challenge',
            description: `<@${userId}> completed the daily challenge!`,
            color: 15195009, // Golden yellow color (E7DF81)
            fields: [
              {
                name: 'Time',
                value: queryData.time_taken,
                inline: true
              },
              {
                name: 'Results',
                value: `\`\`\`\n${queryData.emoji_grid}\n\`\`\``,
                inline: false
              }
            ],
            footer: {
              text: 'Shared from Faustdle',
            },
            timestamp: new Date().toISOString()
          }

          return new Response(JSON.stringify({
            type: 4,
            data: { 
              embeds: [embed],
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 5,
                      label: 'Play Now!',
                      url: 'https://discord.com/activities/1351722811718373447'
                    }
                  ]
                }
              ]
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('Error fetching daily results:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            name: error.name
          })
          return new Response(JSON.stringify({
            type: 4,
            data: {
              content: `❌ Query failed\n\`\`\`\n${error.name}: ${error.message}\n\`\`\``,
              flags: 64
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Legacy direct POST
    console.log('Direct POST format')
    
    // Check if this is a blank entry creation request (game start)
    if (data.type === 'create_blank_entry' && data.userId && data.channelId) {
      console.log('✓ Create blank entry request received')
      
      try {
        // Get today's date in UTC
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const today = `${utcYear}-${utcMonth}-${utcDay}`
        
        console.log('Create blank entry: Checking for existing entry:', {
          userId: data.userId,
          channelId: data.channelId,
          today
        })
        
        // Check if entry already exists
        const { data: existingEntry, error: checkError } = await supabase
          .from('daily_results')
          .select('id')
          .eq('user_id', data.userId)
          .eq('channel_id', data.channelId)
          .eq('game_date', today)
          .maybeSingle()
        
        if (checkError && checkError.code !== 'PGRST116') {
          console.error('Error checking for existing entry:', checkError)
        }
        
        // Only insert if entry doesn't exist
        if (!existingEntry) {
          console.log('No existing entry, creating blank entry')
          
          const insertData = {
            user_id: data.userId,
            channel_id: data.channelId,
            game_date: today,
            emoji_grid: '',
            time_taken: '',
            created_at: new Date().toISOString()
          }
          
          const { error: insertError } = await supabase
            .from('daily_results')
            .insert([insertData])
          
          if (insertError) {
            console.error('Error creating blank entry:', insertError)
            return new Response(JSON.stringify({
              success: false,
              error: 'Failed to create entry'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          
          console.log('Blank entry created successfully')
        } else {
          console.log('Entry already exists, skipping creation')
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Blank entry created or already exists'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        console.error('Create blank entry error:', error)
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    
    // Check if this is an activity emoji grid update request
    if (data.type === 'activity_update' && data.userId && data.channelId && data.emojiGrid !== undefined) {

      console.log('✓ Activity emoji grid update received')
      
      try {
        // Get today's date in UTC
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const today = `${utcYear}-${utcMonth}-${utcDay}`
        
        console.log('Activity update: Saving emoji grid for user:', {
          userId: data.userId,
          channelId: data.channelId,
          today,
          gridLength: data.emojiGrid?.length
        })
        
        // Upsert the emoji grid to database
        const { error: upsertError } = await supabase
          .from('daily_results')
          .upsert(
            {
              user_id: data.userId,
              channel_id: data.channelId,
              game_date: today,
              emoji_grid: data.emojiGrid,
              time_taken: data.timeTaken || '',
              created_at: new Date().toISOString()
            },
            {
              onConflict: 'user_id,game_date,channel_id'
            }
          )
          .select()
        
        if (upsertError) {
          console.error('Upsert error:', upsertError)
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to save emoji grid'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        // Get all players for this activity session
        const { data: allPlayers, error: playersError } = await supabase
          .from('daily_results')
          .select('user_id, emoji_grid, time_taken')
          .eq('channel_id', data.channelId)
          .eq('game_date', today)
        
        if (playersError) {
          console.error('Error fetching players:', playersError)
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to fetch players'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        // Edit the original Discord message if we have the token and message ID
        let editToken = data.interactionToken
        let messageId = null
        
        console.log('Activity update: Attempting to edit Discord message', {
          hasDataToken: !!data.interactionToken,
          today,
          channelId: data.channelId,
          cacheKey: `${data.channelId}:${today}`
        })
        
        if (!editToken) {
          // Try to retrieve token from cache if not provided
          editToken = await getToken(data.channelId, today)
          console.log('Activity update: Retrieved token from cache:', {
            success: !!editToken,
            cacheKey: `${data.channelId}:${today}`
          })
        }
        
        if (editToken) {
          // Try to get the stored message ID
          messageId = await getMessageId(data.channelId, today)
          console.log('Activity update: Retrieved message ID from cache:', {
            hasMessageId: !!messageId,
            messageId: messageId || 'NOT FOUND YET (may arrive soon)',
            cacheKey: `${data.channelId}:${today}`
          })
        }
        
        if (editToken && messageId) {
          try {
            const appId = '1351722811718373447' // Faustdle app ID
            const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${editToken}/messages/${messageId}`
            
            // Use the real connected member count from the Activity SDK (sent by client)
            // BUT: if SDK shows 0 members but we have players, use the player count instead
            // (SDK might show 0 for members who are in the activity but not "connected" to instance)
            let connectedMemberCount = data.connectedMemberCount ?? 0;
            if (connectedMemberCount === 0 && allPlayers && allPlayers.length > 0) {
              connectedMemberCount = allPlayers.length;
              console.log('Activity update: SDK returned 0 members, but found players in activity, using player count:', connectedMemberCount);
            }
            
            console.log('Activity update: Sending PATCH to Discord:', {
              url: webhookUrl.substring(0, 60) + '...',
              connectedMembers: connectedMemberCount,
              totalPlayers: allPlayers?.length || 0
            })
            
            // Build the updated embed
            const fields = allPlayers && allPlayers.length > 0 
              ? allPlayers.map(player => ({
                  name: '',
                  value: `<@${player.user_id}>\n\nTime: ${player.time_taken || '⏳ playing'}\n\`\`\`\n${player.emoji_grid || '⏳ started'}\n\`\`\``,
                  inline: false
                }))
              : [{
                  name: 'Starting...',
                  value: 'Activity initialized',
                  inline: false
                }]
            
            const embed = {
              title: 'Faustdle Daily Challenge',
              description: `Activity in progress - ${connectedMemberCount} member(s) connected`,
              color: 15195009, // Golden yellow color
              fields,
              footer: {
                text: 'Shared from Faustdle'
              },
              timestamp: new Date().toISOString()
            }
            
            // Call Discord API to edit the message
            const editResponse = await fetch(webhookUrl, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                embeds: [embed],
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 5,
                        label: 'Play Now!',
                        url: 'https://discord.com/activities/1351722811718373447'
                      }
                    ]
                  }
                ]
              })
            })
            
            if (!editResponse.ok) {
              const errorBody = await editResponse.text()
              console.error('❌ Failed to edit Discord message:', {
                status: editResponse.status,
                statusText: editResponse.statusText,
                url: webhookUrl.substring(0, 60) + '...',
                body: errorBody.substring(0, 200)
              })
            } else {
              console.log('✅ Discord message edited successfully')
            }
          } catch (editError: any) {
            console.error('❌ Error editing Discord message:', {
              message: editError.message,
              name: editError.name
            })
            // Don't fail the request if message edit fails
          }
        } else {
          console.warn('⚠️ Cannot edit Discord message yet - waiting for message ID to be captured:', {
            hasToken: !!editToken,
            hasMessageId: !!messageId,
            nextAttempt: '(will retry on next guess)'
          })
        }
        
        // Return all players' current state
        return new Response(JSON.stringify({
          success: true,
          players: allPlayers || [],
          count: allPlayers?.length || 0
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        console.error('Activity update error:', error)
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Handle member count updates (members joining/leaving without making guesses)
    if (data.type === 'member_count_update' && data.channelId && data.connectedMemberCount !== undefined) {
      console.log('✓ Member count update received', {
        channelId: data.channelId,
        connectedMembers: data.connectedMemberCount,
        type: typeof data.connectedMemberCount,
        fullData: JSON.stringify(data)
      })
      
      try {
        // Get today's date in UTC
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const today = `${utcYear}-${utcMonth}-${utcDay}`
        
        // Update activity tracking
        // (Removed: was attempting to track 0-member state via heartbeat)
        
        // Retrieve token and message ID from cache
        let editToken = await getToken(data.channelId, today)
        let messageId = await getMessageId(data.channelId, today)
        
        console.log('📋 Token/Message cache lookup:', {
          hasToken: !!editToken,
          tokenLength: editToken?.length,
          hasMessageId: !!messageId,
          messageIdValue: messageId
        })
        
        if (editToken && messageId) {
          try {
            const appId = '1351722811718373447'
            const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${editToken}/messages/${messageId}`
            
            // Get all players for this session
            const { data: allPlayers } = await supabase
              .from('daily_results')
              .select('user_id, emoji_grid, time_taken')
              .eq('channel_id', data.channelId)
              .eq('game_date', today)
            
            // Build the updated embed with current member count
            const fields = allPlayers && allPlayers.length > 0 
              ? allPlayers.map(player => ({
                  name: '',
                  value: `<@${player.user_id}>\n\nTime: ${player.time_taken || '⏳ playing'}\n\`\`\`\n${player.emoji_grid || '⏳ started'}\n\`\`\``,
                  inline: false
                }))
              : [{
                  name: 'Starting...',
                  value: 'Activity initialized',
                  inline: false
                }]
            
            const embed = {
              title: 'Faustdle Daily Challenge',
              description: `Activity in progress - ${data.connectedMemberCount} member(s) connected`,
              color: 15195009,
              fields,
              footer: { text: 'Shared from Faustdle' },
              timestamp: new Date().toISOString()
            }
            
            console.log('🔄 Preparing webhook PATCH:', {
              url: webhookUrl,
              memberCount: data.connectedMemberCount,
              embedDescription: embed.description,
              fieldsCount: fields.length
            })
            
            const editResponse = await fetch(webhookUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                embeds: [embed],
                components: [{
                  type: 1,
                  components: [{
                    type: 2,
                    style: 5,
                    label: 'Play Now!',
                    url: 'https://discord.com/activities/1351722811718373447'
                  }]
                }]
              })
            })
            
            if (editResponse.ok) {
              console.log('✅ Member count message updated successfully', {
                status: editResponse.status,
                newMemberCount: data.connectedMemberCount
              })
            } else {
              const responseText = await editResponse.text()
              console.error('❌ Failed to update member count message:', {
                status: editResponse.status,
                statusText: editResponse.statusText,
                responseBody: responseText
              })
            }
          } catch (editError: any) {
            console.error('❌ Error updating member count message:', editError.message)
          }
        } else {
          console.warn('⚠️ Cannot update message - missing token or message ID')
        }
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Member count updated'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        console.error('Member count update error:', error)
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Handle activity completion - final save with proper upsert (with service role key)
    if (data.type === 'activity_completion' && data.userId && data.channelId && data.emojiGrid !== undefined) {
      console.log('✓ Activity completion received')
      
      try {
        // Get today's date in UTC
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const today = `${utcYear}-${utcMonth}-${utcDay}`
        
        console.log('Activity completion: Saving emoji grid for user:', {
          userId: data.userId,
          channelId: data.channelId,
          today,
          gridLength: data.emojiGrid?.length
        })
        
        // Upsert the final emoji grid to database using service role key
        const { error: upsertError } = await supabase
          .from('daily_results')
          .upsert(
            {
              user_id: data.userId,
              channel_id: data.channelId,
              game_date: today,
              emoji_grid: data.emojiGrid,
              time_taken: data.timeTaken || '',
              created_at: new Date().toISOString()
            },
            {
              onConflict: 'user_id,game_date,channel_id'
            }
          )
          .select()
        
        if (upsertError) {
          console.error('Activity completion upsert error:', upsertError)
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to save game completion'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        console.log('Activity completion: Game results saved successfully')
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Game completion saved'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        console.error('Activity completion error:', error)
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    // Handle syncing cached results from local storage to a new channel
    // Used when user completes puzzle in one channel, then loads game in another channel
    if (data.type === 'sync_cached_results' && data.userId && data.channelId && data.emojiGrid !== undefined) {
      console.log('✓ Sync cached results received')
      
      try {
        // Get today's date in UTC
        const now = new Date();
        const utcYear = now.getUTCFullYear();
        const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
        const utcDay = String(now.getUTCDate()).padStart(2, '0');
        const today = `${utcYear}-${utcMonth}-${utcDay}`
        
        console.log('Sync cached results: Updating channel entry for user:', {
          userId: data.userId,
          channelId: data.channelId,
          today,
          gridLength: data.emojiGrid?.length
        })
        
        // Update the entry for this channel with the cached game data
        const { error: updateError } = await supabase
          .from('daily_results')
          .update({
            emoji_grid: data.emojiGrid,
            time_taken: data.timeTaken || ''
          })
          .eq('user_id', data.userId)
          .eq('channel_id', data.channelId)
          .eq('game_date', today)
        
        if (updateError) {
          console.error('Sync cached results update error:', updateError)
          return new Response(JSON.stringify({
            success: false,
            error: 'Failed to sync cached results'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        console.log('Sync cached results: Channel entry updated successfully')
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Cached results synced to channel'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (error: any) {
        console.error('Sync cached results error:', error)
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    
    // Original direct POST format - legacy support for bot posts
    const { channelId, userId, characterName, gameMode, emojiGrid, time } = data

    if (!channelId || !userId || !characterName || !emojiGrid) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const botToken = Deno.env.get('DISCORD_BOT_TOKEN')
    if (!botToken) {
      return new Response(JSON.stringify({ error: 'DISCORD_BOT_TOKEN not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const gameTypeText = gameMode === 'daily' 
      ? 'Completed the daily challenge'
      : characterName 
        ? `found ${characterName}`
        : 'Completed a game'

    const messageContent = `<@${userId}> (${gameTypeText})
Time: ${time}
\`\`\`
${emojiGrid}
\`\`\`
-# Shared from [Faustdle](${discordAppLink})`

    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: messageContent }),
      }
    )

    if (!discordResponse.ok) {
      const errorData = await discordResponse.json().catch(() => ({}))
      return new Response(JSON.stringify({ error: 'Failed to post message' }), {
        status: discordResponse.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const responseData = await discordResponse.json()
    return new Response(JSON.stringify({ success: true, messageId: responseData.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
