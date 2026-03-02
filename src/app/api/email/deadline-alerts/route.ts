import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendDeadlineAlert } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron request or has proper auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get tasks with deadlines coming up (today, tomorrow, or in 3 days)
    const { data: deadlineTasks } = await supabase
      .from('planner_tasks')
      .select('*')
      .in('deadline', [today, tomorrow, threeDaysFromNow])
      .eq('status', 'todo');

    if (!deadlineTasks || deadlineTasks.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No deadline alerts to send',
        alertCount: 0 
      });
    }

    let alertsSent = 0;
    const errors: any[] = [];

    // Send alerts for each deadline task
    for (const task of deadlineTasks) {
      const daysUntilDeadline = Math.ceil((new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      
      // Only send for specific days: today (0), tomorrow (1), or 3 days out
      if (![0, 1, 3].includes(daysUntilDeadline)) {
        continue;
      }

      const emailTask = {
        title: task.title,
        deadline: new Date(task.deadline).toLocaleDateString(),
        priority: task.priority,
        status: task.status,
        daysUntilDeadline,
      };

      const result = await sendDeadlineAlert(emailTask);
      
      if (result.success) {
        alertsSent++;
      } else {
        errors.push({ task: task.title, error: result.error });
      }

      // Rate limit: wait 1 second between emails
      if (alertsSent < deadlineTasks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sent ${alertsSent} deadline alerts`,
      alertCount: alertsSent,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Deadline alerts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Allow manual triggering via GET
export async function GET() {
  return POST(new NextRequest('http://localhost/api/email/deadline-alerts', { method: 'POST' }));
}