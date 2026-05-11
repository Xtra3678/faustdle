import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qrprexuziojupqvvdefy.supabase.co'
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
const botToken = Deno.env.get('DISCORD_BOT_TOKEN')

const supabase = createClient(supabaseUrl, supabaseKey!)

/**
 * Send daily streak reminder messages to channels
 * Replies to the first /faustdle command of the day with yesterday's results and streak count
 * Sends 24 hours after first message
 */

// For production: 24*60*60*1000 (24 hours in milliseconds)
const ReminderDelay = 24 * 60 * 60 * 1000 // 24 hours

serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {    // Check for authorization (either from cron job or allow if from localhost for testing)
    const authHeader = req.headers.get('Authorization')
    const expectedKey = Deno.env.get('REMINDER_CRON_KEY') || 'test-key-123'
    
    // For testing/localhost, allow without auth. For production, require it.
    const isLocalhost = req.headers.get('host')?.includes('localhost')
    if (!isLocalhost && authHeader !== `Bearer ${expectedKey}`) {
      console.warn('❌ Unauthorized reminder request')
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.log('� Daily reminder function triggered')
    console.log('Bot token available:', !!botToken)

    // Get all entries that need reminders sent
    console.log('📋 Querying database for entries needing reminders...')
    const { data: entriesNeedingReminders, error: queryError } = await supabase
      .from('discord_interaction_tokens')
      .select('*')
      .eq('reminder_sent', false)
      .not('first_message_id', 'is', null)
      .not('first_message_timestamp', 'is', null)
      .not('reminder_webhook_url', 'is', null) // Only entries with webhook URL

    if (queryError) {
      console.error('❌ Database query error:', queryError.code, queryError.message)
      return new Response(JSON.stringify({ error: `Database error: ${queryError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!entriesNeedingReminders) {
      console.log('⚠️ Query returned null')
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'Query returned null' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`📋 Found ${entriesNeedingReminders.length} entries to check`)

    let remindersSent = 0
    const now = Date.now()

    for (const entry of entriesNeedingReminders) {
      const firstMessageTime = new Date(entry.first_message_timestamp).getTime()
      const timePassed = now - firstMessageTime

      console.log(`Checking ${entry.channel_id}: ${timePassed}ms passed (need ${ReminderDelay}ms)`)

      // Check if enough time has passed
      if (timePassed < ReminderDelay) {
        console.log(`⏳ Skipping ${entry.channel_id} - not ready yet`)
        continue
      }

      try {
        // Get yesterday's results for this channel/date
        const yesterday = new Date()
        yesterday.setUTCDate(yesterday.getUTCDate() - 1)
        const yesterdayDate = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`

        const { data: yesterdayResults, error: resultsError } = await supabase
          .from('daily_results')
          .select('user_id, time_taken, emoji_grid')
          .eq('channel_id', entry.channel_id)
          .eq('game_date', yesterdayDate)

        if (resultsError) {
          console.error(`⚠️ Error getting yesterday's results:`, resultsError.message)
          continue
        }

        // Format the results
        const results = formatYesterdayResults(yesterdayResults || [])
        const streakCount = entry.current_streak_count || 1

        // Build the reminder message
        let reminderMessage: string
        if (!yesterdayResults || yesterdayResults.length === 0) {
          // Streak was broken because nobody played
          reminderMessage = `Your group lost your 🔥 **${streakCount}** day streak!\n\nNobody played yesterday. Play today to start a new one!`
        } else {
          // Streak continues
          reminderMessage = `Your group is on a 🔥 **${streakCount}** day streak!\n\n**Yesterday's Results:**\n${results}`
        }

        // Send reply using the stored webhook URL (interaction token webhook for this interaction)
        // This webhook is valid for 15 minutes from when the activity interaction started
        const sendResponse = await fetch(
          `${entry.reminder_webhook_url}?wait=true`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              content: reminderMessage,
              message_reference: {
                message_id: entry.first_message_id,
                channel_id: entry.channel_id,
                fail_if_not_exists: false
              },
              allowed_mentions: {
                replied_user: false
              },
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
          }
        )

        if (sendResponse.ok) {
          try {
            const reminderData = await sendResponse.json()
            const reminderMessageId = reminderData.id

            console.log(`✅ Sent reminder for ${entry.channel_id}, message ID: ${reminderMessageId}`)
            remindersSent++

            // Create a persistent webhook for future streak break messages
            let persistentWebhookUrl = null
            if (botToken) {
              try {
                const webhookResponse = await fetch(
                  `https://discord.com/api/v10/channels/${entry.channel_id}/webhooks`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bot ${botToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      name: 'Faustdle Streak Notifications',
                      avatar: null
                    })
                  }
                )

                if (webhookResponse.ok) {
                  const webhookData = await webhookResponse.json()
                  persistentWebhookUrl = `https://discord.com/api/v10/webhooks/${webhookData.id}/${webhookData.token}`
                  console.log(`✅ Created persistent webhook for ${entry.channel_id}`)
                } else {
                  console.warn(`⚠️ Failed to create persistent webhook: ${webhookResponse.status}`)
                }
              } catch (webhookErr: any) {
                console.warn(`⚠️ Error creating persistent webhook:`, webhookErr.message)
              }
            }

            // Mark as sent and store reminder message ID + persistent webhook
            const { error: updateError } = await supabase
              .from('discord_interaction_tokens')
              .update({
                reminder_sent: true,
                reminder_message_id: reminderMessageId,
                persistent_webhook_url: persistentWebhookUrl
              })
              .eq('cache_key', entry.cache_key)

            if (updateError) {
              console.error(`⚠️ Error marking reminder as sent:`, updateError.message)
            }
          } catch (parseErr: any) {
            console.error(`❌ Error parsing reminder response:`, parseErr.message)
          }
        } else {
          console.error(`❌ Failed to send reminder:`, sendResponse.status, await sendResponse.text())
        }
      } catch (err: any) {
        console.error(`❌ Error processing entry:`, err.message)
      }
    }

    // Check for broken streaks: entries with active streaks that didn't have games the next day
    console.log('🔍 Checking for broken streaks...')
    
    // Get today's date
    const today = new Date()
    const todayDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
    
    const { data: allEntriesWithStreaks, error: streakCheckError } = await supabase
      .from('discord_interaction_tokens')
      .select('*')
      .eq('reminder_sent', true)
      .eq('streak_broken_notified', false)
      .gt('current_streak_count', 0)
      .not('first_message_id', 'is', null)
      .not('reminder_webhook_url', 'is', null)

    if (streakCheckError) {
      console.error('⚠️ Error querying for streak checking:', streakCheckError.message)
    } else if (allEntriesWithStreaks) {
      console.log(`📋 Found ${allEntriesWithStreaks.length} entries with active streaks to check`)

      for (const entry of allEntriesWithStreaks) {
        try {
          const entryDate = extractDateFromCacheKey(entry.cache_key)
          if (!entryDate) {
            console.warn(`⚠️ Could not extract date from cache_key: ${entry.cache_key}`)
            continue
          }

          // Only check for streak break if today is after the entry date
          if (todayDate <= entryDate) {
            console.log(`⏳ Skipping ${entry.channel_id} - entry date hasn't passed yet (entry: ${entryDate}, today: ${todayDate})`)
            continue
          }

          // Check if TODAY has any games for this channel
          const { data: todayResults, error: todayError } = await supabase
            .from('daily_results')
            .select('id')
            .eq('channel_id', entry.channel_id)
            .eq('game_date', todayDate)
            .limit(1)

          if (todayError) {
            console.error(`⚠️ Error checking today's results:`, todayError.message)
            continue
          }

          // If no games today, the streak is broken
          if (!todayResults || todayResults.length === 0) {
            console.log(`💔 Streak broken for ${entry.channel_id}: no games on ${todayDate}`)

            const streakBrokenMessage = `🔥 **Streak Broken!** Your ${entry.current_streak_count}-day streak has ended. Play today to start a new one!`

            // Use persistent webhook to reply to the reminder message
            if (entry.persistent_webhook_url && entry.reminder_message_id) {
              const sendResponse = await fetch(
                `${entry.persistent_webhook_url}?wait=true`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    content: streakBrokenMessage,
                    message_reference: {
                      message_id: entry.reminder_message_id,
                      channel_id: entry.channel_id,
                      fail_if_not_exists: false
                    },
                    allowed_mentions: {
                      replied_user: false
                    },
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
                }
              )

              if (sendResponse.ok) {
                console.log(`✅ Sent streak broken message for ${entry.channel_id}`)

                // Mark as notified
                const { error: updateError } = await supabase
                  .from('discord_interaction_tokens')
                  .update({ streak_broken_notified: true })
                  .eq('cache_key', entry.cache_key)

                if (updateError) {
                  console.error(`⚠️ Error marking streak as broken:`, updateError.message)
                }
              } else {
                console.error(`❌ Failed to send streak broken message:`, sendResponse.status, await sendResponse.text())
              }
            } else {
              console.warn(`⚠️ Cannot send streak broken message - missing webhook or reminder message ID`)
            }
          }
        } catch (err: any) {
          console.error(`❌ Error processing streak check:`, err.message)
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent: remindersSent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

/**
 * Format yesterday's results for display
 */
function formatYesterdayResults(results: any[]): string {
  if (results.length === 0) {
    return '❌ Nobody played yesterday!'
  }

  // Separate by guess count
  const guessGroups: { [key: string]: any[] } = {}
  const incomplete: any[] = []

  for (const result of results) {
    if (!result.time_taken || result.time_taken.trim() === '') {
      incomplete.push(result)
    } else {
      const guessCount = result.time_taken.split('/')[0].trim()
      if (!guessGroups[guessCount]) {
        guessGroups[guessCount] = []
      }
      guessGroups[guessCount].push(result)
    }
  }

  // Build formatted string
  let formatted = ''

  // Add completed results sorted by guess count
  const sortedGuesses = Object.keys(guessGroups).sort((a, b) => parseInt(a) - parseInt(b))
  for (let i = 0; i < sortedGuesses.length; i++) {
    const guessCount = sortedGuesses[i]
    const emoji = i === 0 ? '👑' : `${i + 1}️⃣`
    const users = guessGroups[guessCount].map(r => `<@${r.user_id}>`).join(', ')
    formatted += `${emoji} ${guessCount} guesses: ${users}\n`
  }

  // Add incomplete
  if (incomplete.length > 0) {
    const users = incomplete.map(r => `<@${r.user_id}>`).join(', ')
    formatted += `❌ Didn't finish: ${users}`
  }

  return formatted
}

/**
 * Extract date from cache_key (format: channel_id:YYYY-MM-DD)
 */
function extractDateFromCacheKey(cacheKey: string): string | null {
  const parts = cacheKey.split(':')
  if (parts.length === 2) {
    return parts[1]
  }
  return null
}

/**
 * Add days to a date string (format: YYYY-MM-DD)
 */
function addDaysToDateString(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}
