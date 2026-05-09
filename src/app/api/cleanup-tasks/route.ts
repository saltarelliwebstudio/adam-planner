import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  // Auto-complete recurring tasks from 2+ days ago that are still "todo"
  // (yesterday's tasks stay visible for one day in case Adam wants to check them off)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffDate = cutoff.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("planner_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("status", "todo")
    .eq("source", "recurring")
    .lt("scheduled_date", cutoffDate)
    .select("id");

  const cleaned = data?.length || 0;

  if (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also clean up old dedup entries (>30 days)
  const oldCutoff = new Date();
  oldCutoff.setDate(oldCutoff.getDate() - 30);

  await supabase
    .from("planner_recurring_generated")
    .delete()
    .lt("generated_at", oldCutoff.toISOString());

  return NextResponse.json({
    ok: true,
    cleaned,
    cutoff: cutoffDate,
    message: `Auto-completed ${cleaned} overdue recurring tasks`,
  });
}
