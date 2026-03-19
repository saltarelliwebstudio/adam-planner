import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDigest } from '@/lib/email';

export async function GET() {
  // Test email with sample data
  const testData = {
    date: new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    todayTasks: [
      { title: 'Review client proposal', priority: 'high' as const, status: 'todo' as const, deadline: 'Feb 25, 2026' },
      { title: 'Update website copy', priority: 'medium' as const, status: 'todo' as const },
      { title: 'Social media post', priority: 'low' as const, status: 'todo' as const },
    ],
    upcomingDeadlines: [
      { title: 'Client project delivery', priority: 'high' as const, status: 'todo' as const, deadline: 'Feb 26, 2026', daysUntilDeadline: 2 },
    ],
    big3: ['Morning routine', 'Post 2 pieces of content'],
    completedYesterday: 3,
  };

  const result = await sendDailyDigest(testData);

  if (result.success) {
    return NextResponse.json({ 
      success: true, 
      message: 'Test email sent successfully!',
      data: result.data 
    });
  } else {
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to send test email',
      details: result.error 
    }, { status: 500 });
  }
}