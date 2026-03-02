import { addTask } from '@/lib/store'
import { Task } from '@/lib/types'

// Simple API for adding tasks via voice/text (for Siri Shortcuts integration)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { text, priority = 'medium', category = 'personal', date } = body

    if (!text || typeof text !== 'string') {
      return Response.json({ error: 'Text is required' }, { status: 400 })
    }

    // Default to today if no date provided
    const scheduledDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' })

    const task = addTask({
      title: text.trim(),
      priority: priority as Task['priority'],
      category: category as Task['category'],
      scheduledDate,
      status: 'todo',
    })

    return Response.json({ 
      success: true, 
      task: {
        id: task.id,
        title: task.title,
        scheduledDate: task.scheduledDate,
      }
    })
  } catch (error) {
    console.error('Quick add error:', error)
    return Response.json({ error: 'Failed to add task' }, { status: 500 })
  }
}

// Handle GET for testing
export async function GET() {
  return Response.json({ 
    message: 'Quick Add API - Use POST with { "text": "your task", "priority": "high|medium|low", "category": "business|client|school|personal|health", "date": "YYYY-MM-DD" }' 
  })
}