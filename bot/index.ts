import 'dotenv/config'
import { Bot } from 'grammy'
import cron from 'node-cron'
import { parseUserMessage } from './lib/claude.js'
import * as api from './lib/planner-api.js'
import { handleGetSchedule, handleAddAdhoc } from './handlers/schedule.js'
import { handleAddTask } from './handlers/tasks.js'
import { morningDebrief, eveningDebrief } from './handlers/debrief.js'
import { weeklyRecap } from './handlers/recap.js'
import { handleCrmStatus, handleLeadDetail, handleFollowupsDue, handlePauseDrip, handleAddLead } from './handlers/crm.js'
import { handlePlanDay } from './handlers/plan-day.js'
import { handleCompleteTask, handleMoveTask } from './handlers/tasks.js'
import { handleDevQueueAdd, handleDevQueueStatus } from './handlers/dev.js'
import { handleScoutDigest, handleContentIdeas, handleScoutResearch } from './handlers/scout.js'
import { processBrainInbox } from './handlers/brain-processor.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required')

const ADAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID // Adam's chat ID for cron messages

const bot = new Bot(token)

// ── Message handler ──

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim()

  try {
    // Quick commands (no AI needed)
    if (/^(plan my day|plan today|plan the day)/i.test(text)) {
      await ctx.reply('🔄 Building your plan...')
      const msg = await handlePlanDay(false)
      try {
        await ctx.reply(msg, { parse_mode: 'Markdown' })
      } catch {
        // Markdown parsing failed — send as plain text
        await ctx.reply(msg.replace(/[*_`]/g, ''))
      }
      return
    }

    if (/^(my day|what.?s my day|schedule|today)/i.test(text)) {
      const msg = await handleGetSchedule()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^recap|weekly recap/i.test(text)) {
      const msg = await weeklyRecap()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^(crm status|crm|pipeline|leads overview)/i.test(text)) {
      const msg = await handleCrmStatus()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^(who needs follow.?up|follow.?ups|followups due)/i.test(text)) {
      const msg = await handleFollowupsDue()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^(dev queue|dev status)/i.test(text)) {
      const msg = await handleDevQueueStatus()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^(process brain|processbrain|brain process|run brain)/i.test(text)) {
      await ctx.reply('🔄 Processing Brain inbox...')
      const msg = await processBrainInbox()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^(meetings|calendar|what meetings|what calls)/i.test(text)) {
      try {
        const data = await api.getCalendarEvents()
        if (!data.events || data.events.length === 0) {
          await ctx.reply('📅 No meetings scheduled for today.')
        } else {
          const lines = [`📅 *Meetings — ${data.date}:*`, '']
          for (const e of data.events) {
            const start = e.start?.includes('T')
              ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
              : 'All day'
            lines.push(`  • ${start} — *${e.summary}*`)
            if (e.location) lines.push(`    📍 ${e.location}`)
          }
          await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
        }
      } catch {
        await ctx.reply('📅 Calendar not configured yet. Set up Google service account env vars.')
      }
      return
    }

    if (/^(what.?s new|scout|ai digest|weekly digest)/i.test(text)) {
      const msg = await handleScoutDigest()
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^content ideas/i.test(text)) {
      const topic = text.replace(/^content ideas\s*(for\s*)?/i, '').trim() || undefined
      const msg = await handleContentIdeas(topic)
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^research\s+/i.test(text)) {
      const topic = text.replace(/^research\s+/i, '').trim()
      const msg = await handleScoutResearch(topic)
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    if (/^dev:\s+/i.test(text)) {
      const description = text.replace(/^dev:\s+/i, '').trim()
      // Try to extract project name from common patterns
      const projectMatch = description.match(/\bon\s+(genius|planner|hub|cassar|aborigen)\b/i)
      const project = projectMatch ? projectMatch[1].toLowerCase() : undefined
      const msg = await handleDevQueueAdd(description, project)
      await ctx.reply(msg, { parse_mode: 'Markdown' })
      return
    }

    // AI-powered intent parsing for everything else
    const schedule = await api.getSchedule()
    const context = JSON.stringify({
      date: schedule.date,
      dayOfWeek: schedule.dayOfWeek,
      schedule: schedule.schedule,
      tasks: schedule.tasks,
      activeTimer: schedule.activeTimer,
    }, null, 2)

    const parsed = await parseUserMessage(text, context)

    switch (parsed.intent) {
      case 'get_schedule': {
        const msg = await handleGetSchedule(parsed.params.date)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'add_adhoc': {
        const msg = await handleAddAdhoc(
          parsed.params.date,
          parsed.params.label,
          parsed.params.startTime,
          parsed.params.endTime,
          parsed.params.emoji
        )
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'add_task': {
        const msg = await handleAddTask(
          parsed.params.title,
          parsed.params.scheduledDate,
          parsed.params.priority,
          parsed.params.category
        )
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'skip_block': {
        // Need to find the block ID from the schedule
        const block = schedule.schedule.find((b: any) =>
          b.label.toLowerCase().includes(parsed.params.blockLabel?.toLowerCase() || '')
        )
        if (block) {
          await ctx.reply(`⏭ Skipped *${block.label}* for ${parsed.params.date}`, { parse_mode: 'Markdown' })
        } else {
          await ctx.reply(parsed.reply)
        }
        break
      }

      case 'rebuild_day': {
        await ctx.reply('🔄 Building your plan...')
        const planMsg = await handlePlanDay(true)
        try {
          await ctx.reply(planMsg, { parse_mode: 'Markdown' })
        } catch {
          await ctx.reply(planMsg.replace(/[*_`]/g, ''))
        }
        break
      }

      case 'complete_task': {
        const completeMsg = await handleCompleteTask(parsed.params.taskTitle, schedule)
        await ctx.reply(completeMsg, { parse_mode: 'Markdown' })
        break
      }

      case 'move_task': {
        const moveMsg = await handleMoveTask(parsed.params.taskTitle, parsed.params.scheduledDate, schedule)
        await ctx.reply(moveMsg, { parse_mode: 'Markdown' })
        break
      }

      case 'get_recap': {
        const msg = await weeklyRecap()
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      // ── Calendar intents ──

      case 'get_calendar': {
        try {
          const data = await api.getCalendarEvents(parsed.params.date)
          if (!data.events || data.events.length === 0) {
            await ctx.reply(`📅 No meetings on ${parsed.params.date || 'today'}.`)
          } else {
            const lines = [`📅 *Meetings — ${data.date}:*`, '']
            for (const e of data.events) {
              const start = e.start?.includes('T')
                ? new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' })
                : 'All day'
              lines.push(`  • ${start} — *${e.summary}*`)
              if (e.location) lines.push(`    📍 ${e.location}`)
            }
            await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
          }
        } catch {
          await ctx.reply('📅 Calendar not configured yet.')
        }
        break
      }

      // ── Scout intents ──

      case 'scout_digest': {
        const msg = await handleScoutDigest()
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'scout_content_ideas': {
        const msg = await handleContentIdeas(parsed.params.topic)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'scout_research': {
        const msg = await handleScoutResearch(parsed.params.topic)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      // ── Dev intents ──

      case 'dev_queue_add': {
        const msg = await handleDevQueueAdd(parsed.params.description, parsed.params.project)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'dev_queue_status': {
        const msg = await handleDevQueueStatus()
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      // ── CRM intents ──

      case 'crm_status': {
        const msg = await handleCrmStatus()
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'crm_lead_detail': {
        const msg = await handleLeadDetail(parsed.params.name)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'crm_followups': {
        const msg = await handleFollowupsDue()
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'crm_pause_drip': {
        const msg = await handlePauseDrip(parsed.params.name)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'crm_add_lead': {
        const msg = await handleAddLead(parsed.params.name, parsed.params.phone)
        await ctx.reply(msg, { parse_mode: 'Markdown' })
        break
      }

      case 'chat':
      default:
        await ctx.reply(parsed.reply)
        break
    }
  } catch (error) {
    console.error('Error handling message:', error)
    await ctx.reply('❌ Something went wrong. Try again in a moment.')
  }
})

// ── Cron jobs ──

async function sendCronMessage(getMessage: () => Promise<string>) {
  if (!ADAM_CHAT_ID) {
    console.log('No TELEGRAM_CHAT_ID set, skipping cron message')
    return
  }
  try {
    const msg = await getMessage()
    await bot.api.sendMessage(ADAM_CHAT_ID, msg, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Cron message failed:', error)
  }
}

// Morning debrief: 6:30 AM ET (10:30 UTC during EDT, 11:30 UTC during EST)
cron.schedule('30 10 * * *', () => sendCronMessage(morningDebrief), { timezone: 'America/Toronto' })

// Evening debrief: 10:00 PM ET
cron.schedule('0 22 * * *', () => sendCronMessage(eveningDebrief), { timezone: 'America/Toronto' })

// Sunday weekly recap: 8:00 PM ET
cron.schedule('0 20 * * 0', () => sendCronMessage(weeklyRecap), { timezone: 'America/Toronto' })

// Sunday AI scout digest: 6:00 PM ET (before recap)
cron.schedule('0 18 * * 0', () => sendCronMessage(handleScoutDigest), { timezone: 'America/Toronto' })

// ── Start ──

bot.start({
  onStart: () => {
    console.log('🤖 Adam Planner Bot is running!')
    console.log(`📅 Morning debrief: 6:30 AM ET`)
    console.log(`🌙 Evening debrief: 10:00 PM ET`)
    console.log(`🔬 AI Scout digest: Sunday 6:00 PM ET`)
    console.log(`📊 Weekly recap: Sunday 8:00 PM ET`)
  },
})
