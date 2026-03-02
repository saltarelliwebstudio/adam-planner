import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');

export interface EmailTask {
  title: string;
  deadline?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  daysUntilDeadline?: number;
}

export interface DailyDigestData {
  date: string;
  todayTasks: EmailTask[];
  upcomingDeadlines: EmailTask[];
  big3: string[];
  completedYesterday: number;
}

export async function sendDailyDigest(data: DailyDigestData, to: string = 'saltarelliwebstudio@gmail.com') {
  const { date, todayTasks, upcomingDeadlines, big3, completedYesterday } = data;
  
  const taskRows = todayTasks
    .map(task => {
      const priorityEmoji = { high: '🔥', medium: '⚡', low: '📋' }[task.priority];
      const deadlineText = task.deadline ? `(Due: ${task.deadline})` : '';
      return `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
          ${priorityEmoji} ${task.title} ${deadlineText}
        </td>
      </tr>`;
    })
    .join('');

  const deadlineRows = upcomingDeadlines
    .map(task => {
      const urgencyEmoji = (task.daysUntilDeadline || 0) <= 1 ? '🚨' : '⚠️';
      const daysText = task.daysUntilDeadline === 0 ? 'TODAY' : 
                      task.daysUntilDeadline === 1 ? 'Tomorrow' :
                      `${task.daysUntilDeadline} days`;
      return `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
          ${urgencyEmoji} ${task.title} - <strong>${daysText}</strong>
        </td>
      </tr>`;
    })
    .join('');

  const big3Rows = big3
    .map(item => `<tr><td style="padding: 4px 0;">• ${item}</td></tr>`)
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Planner Digest</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px;">📅 Daily Planner</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">${date}</p>
        </div>

        ${completedYesterday > 0 ? `
        <div style="background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 5px 0; color: #0ea5e9;">🎉 Yesterday's Progress</h3>
          <p style="margin: 0;">You completed <strong>${completedYesterday} tasks</strong> yesterday. Keep it up!</p>
        </div>
        ` : ''}

        <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">🎯 Today's Big 3</h2>
          <table style="width: 100%;">
            ${big3Rows}
          </table>
        </div>

        ${todayTasks.length > 0 ? `
        <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #667eea; padding-bottom: 5px;">📋 Today's Tasks (${todayTasks.length})</h2>
          <table style="width: 100%;">
            ${taskRows}
          </table>
        </div>
        ` : ''}

        ${upcomingDeadlines.length > 0 ? `
        <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #dc2626;">⏰ Upcoming Deadlines</h2>
          <table style="width: 100%;">
            ${deadlineRows}
          </table>
        </div>
        ` : ''}

        <div style="text-align: center; padding: 20px; color: #666; font-size: 14px;">
          <p>📱 Open your <a href="https://adam-planner.vercel.app" style="color: #667eea;">planner</a> to get started</p>
          <p style="margin: 5px 0 0 0;">Sent by Adam Planner • <a href="https://saltarelliwebstudio.ca" style="color: #667eea;">Saltarelli Web Studio</a></p>
        </div>
      </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Adam Planner <noreply@saltarelliwebstudio.ca>',
      to: [to],
      subject: `📅 Daily Digest - ${date}`,
      html,
    });

    if (error) {
      console.error('Email send error:', error);
      return { success: false, error };
    }

    console.log('Daily digest sent:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Email send failed:', error);
    return { success: false, error };
  }
}

export async function sendDeadlineAlert(task: EmailTask, to: string = 'saltarelliwebstudio@gmail.com') {
  const urgency = (task.daysUntilDeadline || 0) <= 1 ? 'URGENT' : 'REMINDER';
  const daysText = task.daysUntilDeadline === 0 ? 'is due TODAY' : 
                   task.daysUntilDeadline === 1 ? 'is due TOMORROW' :
                   `is due in ${task.daysUntilDeadline} days`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Task Deadline Alert</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: ${task.daysUntilDeadline === 0 ? '#dc2626' : '#ea580c'}; color: white; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px;">${task.daysUntilDeadline === 0 ? '🚨' : '⚠️'} ${urgency}</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Task Deadline Alert</p>
        </div>

        <div style="background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; text-align: center;">
          <h2 style="margin: 0 0 15px 0; color: #333;">${task.title}</h2>
          <p style="font-size: 18px; color: #666; margin: 10px 0;">This task <strong>${daysText}</strong></p>
          <p style="margin: 20px 0;">
            <a href="https://adam-planner.vercel.app" 
               style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              📱 Open Planner
            </a>
          </p>
        </div>

        <div style="text-align: center; padding: 20px; color: #666; font-size: 14px;">
          <p>Sent by Adam Planner • <a href="https://saltarelliwebstudio.ca" style="color: #667eea;">Saltarelli Web Studio</a></p>
        </div>
      </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: 'Adam Planner <noreply@saltarelliwebstudio.ca>',
      to: [to],
      subject: `${task.daysUntilDeadline === 0 ? '🚨 URGENT' : '⚠️ REMINDER'}: ${task.title} ${daysText}`,
      html,
    });

    if (error) {
      console.error('Deadline alert send error:', error);
      return { success: false, error };
    }

    console.log('Deadline alert sent:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Deadline alert send failed:', error);
    return { success: false, error };
  }
}