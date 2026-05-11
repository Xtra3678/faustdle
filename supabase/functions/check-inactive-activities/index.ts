import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://qrprexuziojupqvvdefy.supabase.co'
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')

const supabase = createClient(supabaseUrl, supabaseKey!)

/**
 * Scheduled function to check for inactive activities and send final "0 members" updates
 * Runs every minute via Supabase cron
 */
serve(async (req) => {
  try {
    console.log('🔍 Checking for inactive activities...')

    // Get all activities that haven't been updated in the last 15+ seconds
    // and haven't had their zero update sent yet
    const { data: inactiveActivities, error } = await supabase
      .from('discord_interaction_tokens')
      .select('cache_key, channel_id, game_date, interaction_token, message_id, last_member_count, last_activity_time')
      .eq('sent_zero_members_update', false)
      .not('message_id', 'is', null)
      .not('interaction_token', 'is', null)

    if (error) {
      console.error('❌ Error fetching inactive activities:', error.message)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!inactiveActivities || inactiveActivities.length === 0) {
      console.log('✅ No inactive activities found')
      return new Response(
        JSON.stringify({ success: true, message: 'No inactive activities', processed: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let processedCount = 0

    // Check each activity for inactivity
    for (const activity of inactiveActivities) {
      const lastActivityTime = new Date(activity.last_activity_time)
      const timeSinceLastActivity = Date.now() - lastActivityTime.getTime()
      const isInactive = timeSinceLastActivity > 15000 // 15 seconds of inactivity

      if (!isInactive) continue

      console.log(`⏰ Found inactive activity: ${activity.cache_key} (${timeSinceLastActivity}ms inactive)`)

      try {
        const appId = '1351722811718373447'
        const webhookUrl = `https://discord.com/api/v10/webhooks/${appId}/${activity.interaction_token}/messages/${activity.message_id}`

        // Get all players for this session
        const { data: allPlayers } = await supabase
          .from('daily_results')
          .select('user_id, emoji_grid, time_taken')
          .eq('channel_id', activity.channel_id)
          .eq('game_date', activity.game_date)

        // Build final embed
        const fields = allPlayers && allPlayers.length > 0
          ? allPlayers.map(player => ({
              name: `<@${player.user_id}>`,
              value: `Time: ${player.time_taken || '⏳ playing'}\n\`\`\`\n${player.emoji_grid || '⏳ started'}\n\`\`\``,
              inline: false
            }))
          : [{
              name: 'Activity Ended',
              value: 'All participants have left the activity',
              inline: false
            }]

        const finalEmbed = {
          title: 'Faustdle Daily Challenge',
          description: 'Activity in progress - 0 member(s) connected',
          color: 15195009,
          fields,
          footer: { text: 'Shared from Faustdle' },
          timestamp: new Date().toISOString()
        }

        // Send final update
        const response = await fetch(webhookUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [finalEmbed],
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

        if (response.ok) {
          console.log(`✅ Sent final "0 members" update for ${activity.cache_key}`)
          
          // Mark as sent
          await supabase
            .from('discord_interaction_tokens')
            .update({ sent_zero_members_update: true })
            .eq('cache_key', activity.cache_key)

          processedCount++
        } else {
          console.error(`❌ Failed to send final update for ${activity.cache_key}:`, response.status)
        }
      } catch (err: any) {
        console.error(`❌ Error processing activity ${activity.cache_key}:`, err.message)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inactive activities processed',
        processed: processedCount,
        total: inactiveActivities.length
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('❌ Cron job error:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
