import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendDailyDigest, DailyDigestData } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    // Verify this is a cron request or has proper auth
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Get today's tasks
    const { data: todayTasks } = await supabase
      .from('planner_tasks')
      .select('*')
      .eq('scheduledDate', today)
      .eq('status', 'todo');

    // Get upcoming deadlines (next 7 days)
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: deadlineTasks } = await supabase
      .from('planner_tasks')
      .select('*')
      .gte('deadline', today)
      .lte('deadline', weekFromNow)
      .eq('status', 'todo')
      .order('deadline', { ascending: true });

    // Get Big 3 for current week
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Monday
    const weekStart = startOfWeek.toISOString().split('T')[0];
    
    const { data: big3Data } = await supabase
      .from('planner_big3')
      .select('*')
      .eq('weekStart', weekStart)
      .single();

    // Get yesterday's completed count
    const { data: yesterdayCompleted } = await supabase
      .from('planner_tasks')
      .select('id')
      .eq('scheduledDate', yesterday)
      .eq('status', 'done');

    // Prepare email data
    const emailData: DailyDigestData = {
      date: new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      todayTasks: (todayTasks || []).map(task => ({
        title: task.title,
        deadline: task.deadline ? new Date(task.deadline).toLocaleDateString() : undefined,
        priority: task.priority,
        status: task.status,
      })),
      upcomingDeadlines: (deadlineTasks || []).map(task => ({
        title: task.title,
        deadline: new Date(task.deadline).toLocaleDateString(),
        priority: task.priority,
        status: task.status,
        daysUntilDeadline: Math.ceil((new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      })),
      big3: big3Data?.items || ['Morning routine', 'Post 2 pieces of content'],
      completedYesterday: yesterdayCompleted?.length || 0,
    };

    // Send email
    const result = await sendDailyDigest(emailData);

    if (!result.success) {
      console.error('Failed to send daily digest:', result.error);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Daily digest sent',
      taskCount: emailData.todayTasks.length,
      deadlineCount: emailData.upcomingDeadlines.length,
    });

  } catch (error) {
    console.error('Daily digest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Allow manual triggering via GET
export async function GET() {
  return POST(new NextRequest('http://localhost/api/email/daily-digest', { method: 'POST' }));
}