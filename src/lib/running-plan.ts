// Dual-Event Training Plan — Port Colborne 100 (Jun 13) + Niagara Falls Marathon (Oct 26, Sub-4:00)
// Override: April 11 → June 13 = PC100 block. June 16 → Oct 25 = Marathon block.

export interface RunWorkout {
  type: 'easy' | 'long' | 'tempo' | 'intervals' | 'mp' | 'strength' | 'ma' | 'cross' | 'rest' | 'race' | 'back_to_back' | 'shakeout' | 'night_run' | 'walk' | 'recovery_walk'
  title: string
  notes?: string
  event?: 'pc100' | 'marathon'
  distanceMiles?: number
  targetPace?: string
}

// ── Phase definitions with date ranges and weekly templates ──
// Template keys: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

interface Phase {
  start: string
  end: string
  phase: string
  event: 'pc100' | 'marathon'
  mileage: string
  template: Record<number, RunWorkout>
}

const PHASES: Phase[] = [
  // ═══════════════════════════════════════════════════════════
  // PORT COLBORNE 100 — BLOCK OVERRIDE (Apr 11 → Jun 15)
  // ═══════════════════════════════════════════════════════════

  // PC100 BUILD (Apr 11 – May 9)
  {
    start: '2026-04-11', end: '2026-05-08',
    phase: 'PC100 Build', event: 'pc100', mileage: '~25-35 mi',
    template: {
      0: { type: 'easy', title: 'Easy Run — 4-5 mi', event: 'pc100', distanceMiles: 4.5 },
      1: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      2: { type: 'easy', title: 'Easy Run — 4-6 mi', event: 'pc100', distanceMiles: 5 },
      3: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      4: { type: 'rest', title: 'Rest or Light Walk', event: 'pc100' },
      5: { type: 'long', title: 'Long Run (see key runs)', event: 'pc100' },
      6: { type: 'recovery_walk', title: 'Recovery Walk/Jog', event: 'pc100' },
    },
  },
  // PC100 PEAK (May 9 – May 30)
  {
    start: '2026-05-09', end: '2026-05-30',
    phase: 'PC100 Peak', event: 'pc100', mileage: '~30-40 mi',
    template: {
      0: { type: 'easy', title: 'Easy Run — 5-6 mi', event: 'pc100', distanceMiles: 5.5 },
      1: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      2: { type: 'easy', title: 'Easy Run — 5-6 mi', event: 'pc100', distanceMiles: 5.5 },
      3: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      4: { type: 'rest', title: 'Rest or Light Walk', event: 'pc100' },
      5: { type: 'long', title: 'Long Run (see key runs)', event: 'pc100' },
      6: { type: 'recovery_walk', title: 'Recovery Walk/Jog', event: 'pc100' },
    },
  },
  // PC100 TAPER (May 31 – Jun 12)
  {
    start: '2026-05-31', end: '2026-06-12',
    phase: 'PC100 Taper', event: 'pc100', mileage: '~15-20 mi',
    template: {
      0: { type: 'easy', title: 'Easy Run — 4 mi', event: 'pc100', distanceMiles: 4 },
      1: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      2: { type: 'easy', title: 'Easy Run — 3 mi', event: 'pc100', distanceMiles: 3 },
      3: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      4: { type: 'rest', title: 'Rest Day', event: 'pc100' },
      5: { type: 'long', title: 'Taper Long Run (see key runs)', event: 'pc100' },
      6: { type: 'recovery_walk', title: 'Recovery Walk/Jog or Rest', event: 'pc100' },
    },
  },
  // RACE DAY + RECOVERY (Jun 13 – Jun 15)
  {
    start: '2026-06-13', end: '2026-06-15',
    phase: 'PC100 Race + Recovery', event: 'pc100', mileage: '100 mi (race)',
    template: {
      // These 3 days are all date-overridden, template is fallback
      0: { type: 'rest', title: 'Recovery', event: 'pc100' },
      1: { type: 'rest', title: 'Recovery', event: 'pc100' },
      2: { type: 'rest', title: 'Recovery', event: 'pc100' },
      3: { type: 'rest', title: 'Recovery', event: 'pc100' },
      4: { type: 'rest', title: 'Recovery', event: 'pc100' },
      5: { type: 'rest', title: 'Recovery', event: 'pc100' },
      6: { type: 'rest', title: 'Recovery', event: 'pc100' },
    },
  },

  // ═══════════════════════════════════════════════════════════
  // NIAGARA FALLS MARATHON — Sub-4:00 (Jun 16 → Oct 26)
  // ═══════════════════════════════════════════════════════════

  // MARATHON PHASE 1 — Base Rebuild (Jun 16 – Jul 13)
  {
    start: '2026-06-16', end: '2026-07-13',
    phase: 'Marathon Base Rebuild', event: 'marathon', mileage: '~20-30 mi',
    template: {
      0: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      1: { type: 'easy', title: 'Easy Run — 4-5 mi', event: 'marathon', distanceMiles: 4.5 },
      2: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      3: { type: 'easy', title: 'Easy Run — 5-6 mi', event: 'marathon', distanceMiles: 5.5 },
      4: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      5: { type: 'long', title: 'Long Run (see key runs)', event: 'marathon' },
      6: { type: 'rest', title: 'Rest or 20 min Walk', event: 'marathon' },
    },
  },
  // MARATHON PHASE 2 — Build + Pace Work (Jul 14 – Aug 17)
  {
    start: '2026-07-14', end: '2026-08-17',
    phase: 'Marathon Build', event: 'marathon', mileage: '~30-40 mi',
    template: {
      0: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      1: { type: 'easy', title: 'Easy Run — 5 mi', event: 'marathon', distanceMiles: 5 },
      2: { type: 'tempo', title: 'Tempo/MP Workout (see key runs)', event: 'marathon' },
      3: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      4: { type: 'easy', title: 'Easy Run — 4 mi', event: 'marathon', distanceMiles: 4 },
      5: { type: 'long', title: 'Long Run (see key runs)', event: 'marathon' },
      6: { type: 'rest', title: 'Rest Day', event: 'marathon' },
    },
  },
  // MARATHON PHASE 3 — Peak (Aug 18 – Sep 21)
  {
    start: '2026-08-18', end: '2026-09-21',
    phase: 'Marathon Peak', event: 'marathon', mileage: '~35-45 mi',
    template: {
      0: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      1: { type: 'easy', title: 'Easy Run — 5-6 mi', event: 'marathon', distanceMiles: 5.5 },
      2: { type: 'tempo', title: 'Tempo/MP Workout (see key runs)', event: 'marathon' },
      3: { type: 'rest', title: 'Rest or Easy 4 mi', event: 'marathon' },
      4: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      5: { type: 'long', title: 'Long Run (see key runs)', event: 'marathon' },
      6: { type: 'easy', title: 'Easy Run — 6 mi or Rest', event: 'marathon', distanceMiles: 6 },
    },
  },
  // MARATHON PHASE 4 — Taper (Sep 22 – Oct 24)
  {
    start: '2026-09-22', end: '2026-10-24',
    phase: 'Marathon Taper', event: 'marathon', mileage: '~15-25 mi',
    template: {
      0: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      1: { type: 'easy', title: 'Easy Run — 4 mi', event: 'marathon', distanceMiles: 4 },
      2: { type: 'tempo', title: 'Short MP Run (see key runs)', event: 'marathon' },
      3: { type: 'rest', title: 'Rest Day', event: 'marathon' },
      4: { type: 'easy', title: 'Easy Run — 3 mi', event: 'marathon', distanceMiles: 3 },
      5: { type: 'long', title: 'Taper Long Run (see key runs)', event: 'marathon' },
      6: { type: 'rest', title: 'Rest Day', event: 'marathon' },
    },
  },
  // MARATHON RACE DAY (Oct 25 — Sunday)
  {
    start: '2026-10-25', end: '2026-10-25',
    phase: 'RACE DAY', event: 'marathon', mileage: '26.2 mi (race)',
    template: {
      0: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      1: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      2: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      3: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      4: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      5: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
      6: { type: 'race', title: 'Niagara Falls Marathon — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi' },
    },
  },
]

// ── Date-specific overrides (key runs, race days, specific workouts) ──
// These take priority over phase templates

const DATE_WORKOUTS: Record<string, RunWorkout> = {
  // ─── PC100 BUILD — Key Runs (Saturdays) ───
  '2026-04-11': { type: 'long', title: 'Long Run — 10 mi (baseline)', event: 'pc100', distanceMiles: 10, notes: 'Baseline long run. Practice fueling every 35 min.' },
  '2026-04-18': { type: 'long', title: 'Long Run — 13 mi', event: 'pc100', distanceMiles: 13, notes: 'First stretch past half marathon. Fuel every 35 min, real food at hour marks.' },
  '2026-04-25': { type: 'back_to_back', title: 'Back-to-Back Day 1 — 14 mi', event: 'pc100', distanceMiles: 14, notes: 'Back-to-back weekend #1. Fuel every 35 min. Real food at every hour mark.' },
  '2026-04-26': { type: 'back_to_back', title: 'Back-to-Back Day 2 — 7 mi', event: 'pc100', distanceMiles: 7, notes: 'Day 2 on tired legs. Easy pace, practice eating while running.' },
  '2026-05-02': { type: 'long', title: 'Recovery Long Run — 10 mi', event: 'pc100', distanceMiles: 10, notes: 'Recovery week — drop 30% volume. Easy effort.' },

  // ─── PC100 PEAK — Key Runs (Saturdays) ───
  '2026-05-09': { type: 'long', title: 'Long Run — 18 mi (biggest yet)', event: 'pc100', distanceMiles: 18, notes: 'Full fueling protocol. Start embarrassingly slow. Walk breaks are a tool.' },
  '2026-05-14': { type: 'night_run', title: 'Night Run — 6 mi with headlamp', event: 'pc100', distanceMiles: 6, notes: 'Race simulation — practice running in the dark. Test headlamp.' },
  '2026-05-16': { type: 'back_to_back', title: 'Peak Back-to-Back Day 1 — 20-22 mi', event: 'pc100', distanceMiles: 21, notes: 'PEAK WEEKEND. Full fueling. After this: final gear decisions locked. Nothing new on race day.' },
  '2026-05-17': { type: 'back_to_back', title: 'Peak Back-to-Back Day 2 — 10 mi', event: 'pc100', distanceMiles: 10, notes: 'Day 2 on peak tired legs. Easy pace.' },
  '2026-05-23': { type: 'long', title: 'Confidence Run — 16 mi in full race-day gear', event: 'pc100', distanceMiles: 16, notes: 'Full race-day gear: shoes, socks, clothing, nutrition. Dress rehearsal.' },

  // ─── PC100 TAPER — Key Runs (Saturdays) ───
  '2026-05-30': { type: 'long', title: 'Taper Long Run — 8 mi', event: 'pc100', distanceMiles: 8, notes: 'Taper begins. Drop volume, maintain sharpness.' },
  '2026-06-06': { type: 'shakeout', title: 'Shakeout — 5 mi', event: 'pc100', distanceMiles: 5, notes: 'Light and easy. Sleep more, eat more carbs this week.' },
  '2026-06-11': { type: 'shakeout', title: 'Shakeout — 2 mi only', event: 'pc100', distanceMiles: 2, notes: 'Final shakeout. Stay loose.' },
  '2026-06-12': { type: 'rest', title: 'Complete Rest — Race Tomorrow', event: 'pc100', notes: 'Complete rest. Carb load. Gear packed. Sleep early.' },

  // ─── PC100 RACE DAY + RECOVERY ───
  '2026-06-13': { type: 'race', title: 'PORT COLBORNE 100 — 100 Mile Track Race', event: 'pc100', distanceMiles: 100, notes: 'Start 5:30am at Lakeshore Catholic. 402-403 laps. Charging phase miles 1-40, controlled cruise 40-70, walk/run 4:1 miles 70-90, one more training run 90-100.' },
  '2026-06-14': { type: 'recovery_walk', title: 'Post-Race Recovery — Sleep & Eat', event: 'pc100', notes: 'Sleep, eat, post raw finish reel. Walk only if moving.' },
  '2026-06-15': { type: 'rest', title: 'Post-Race Rest — Walk & Foam Roll', event: 'pc100', notes: 'Walk only, full rest, foam roll. Marathon block begins tomorrow.' },

  // ─── MARATHON BASE REBUILD — Key Long Runs (Saturdays) ───
  '2026-06-20': { type: 'long', title: 'Long Run — 10 mi (first post-ultra)', event: 'marathon', distanceMiles: 10, notes: 'First long run post-ultra. Very easy pace. No pace targets — all runs by feel.' },
  '2026-06-27': { type: 'long', title: 'Long Run — 11 mi', event: 'marathon', distanceMiles: 11 },
  '2026-07-04': { type: 'long', title: 'Long Run — 13 mi', event: 'marathon', distanceMiles: 13 },
  '2026-07-11': { type: 'long', title: 'Long Run — 14 mi', event: 'marathon', distanceMiles: 14 },

  // ─── MARATHON BUILD — Key Long Runs (Saturdays) ───
  '2026-07-18': { type: 'long', title: 'Long Run — 15 mi', event: 'marathon', distanceMiles: 15 },
  '2026-07-25': { type: 'long', title: 'Long Run — 16 mi', event: 'marathon', distanceMiles: 16 },
  '2026-08-01': { type: 'long', title: 'Long Run — 18 mi (first 18-miler)', event: 'marathon', distanceMiles: 18, notes: 'First 18-miler of marathon block.' },
  '2026-08-08': { type: 'long', title: 'Long Run — 16 mi', event: 'marathon', distanceMiles: 16 },
  '2026-08-15': { type: 'long', title: 'Recovery Long Run — 14 mi', event: 'marathon', distanceMiles: 14, notes: 'Recovery week.' },

  // ─── MARATHON BUILD — Key Tempo/MP Workouts (Wednesdays) ───
  '2026-07-15': { type: 'tempo', title: 'Tempo: 4 mi easy + 2 mi at MP + 1 mi cooldown', event: 'marathon', distanceMiles: 7, targetPace: '9:09/mi (MP miles)', notes: 'First MP work. Feel what sub-4 pace (9:09/mi) actually feels like.' },
  '2026-07-22': { type: 'tempo', title: 'Tempo: 4 mi easy + 3 mi at MP + 1 mi cooldown', event: 'marathon', distanceMiles: 8, targetPace: '9:09/mi (MP miles)' },
  '2026-07-29': { type: 'intervals', title: 'Intervals: 3 mi easy + 4x1 mi at tempo (8:30-8:45) w/ 90s rest', event: 'marathon', distanceMiles: 7, targetPace: '8:30-8:45/mi (intervals)' },
  '2026-08-05': { type: 'tempo', title: 'Tempo: 3 mi easy + 5 mi at MP + 1 mi cooldown', event: 'marathon', distanceMiles: 9, targetPace: '9:09/mi (MP miles)' },
  '2026-08-12': { type: 'easy', title: 'Recovery Week — Easy Run Only', event: 'marathon', distanceMiles: 5, notes: 'Recovery week — no tempo.' },

  // ─── MARATHON PEAK — Key Long Runs (Saturdays) ───
  '2026-08-22': { type: 'long', title: 'Long Run — 18 mi', event: 'marathon', distanceMiles: 18 },
  '2026-08-29': { type: 'long', title: 'Long Run — 20 mi (first 20-miler)', event: 'marathon', distanceMiles: 20, notes: 'First 20-miler. Big day.' },
  '2026-09-05': { type: 'long', title: 'Long Run — 18 mi', event: 'marathon', distanceMiles: 18 },
  '2026-09-12': { type: 'long', title: 'Long Run — 22 mi (peak — 20 mi OK too)', event: 'marathon', distanceMiles: 22, notes: 'Peak long run. 20 mi is fine if 22 feels like too much.' },
  '2026-09-19': { type: 'long', title: 'Recovery Long Run — 14 mi', event: 'marathon', distanceMiles: 14, notes: 'Recovery week.' },

  // ─── MARATHON PEAK — Key Tempo/MP Workouts (Wednesdays) ───
  '2026-08-19': { type: 'tempo', title: 'Tempo: 3 mi easy + 6 mi at MP + 1 mi cooldown', event: 'marathon', distanceMiles: 10, targetPace: '9:09/mi (MP miles)' },
  '2026-08-26': { type: 'intervals', title: 'Intervals: 3 mi easy + 3x2 mi at tempo (8:30) w/ 2 min rest', event: 'marathon', distanceMiles: 9, targetPace: '8:30/mi (intervals)' },
  '2026-09-02': { type: 'long', title: 'MP Long: 16 mi total, miles 10-14 at MP', event: 'marathon', distanceMiles: 16, targetPace: '9:09/mi (miles 10-14)', notes: 'Pace-specific long run. Hold MP for miles 10-14.' },
  '2026-09-09': { type: 'tempo', title: 'Tempo: 3 mi easy + 8 mi at MP + 1 mi cooldown', event: 'marathon', distanceMiles: 12, targetPace: '9:09/mi (MP miles)' },
  '2026-09-16': { type: 'long', title: 'MP Long: 20 mi — last 4 at MP if feeling strong', event: 'marathon', distanceMiles: 20, targetPace: '9:09/mi (last 4 mi)', notes: 'Optional MP finish. Only if feeling strong.' },

  // ─── MARATHON TAPER — Key Runs (Saturdays) ───
  '2026-09-26': { type: 'long', title: 'Taper Long Run — 16 mi (last double-digit)', event: 'marathon', distanceMiles: 16, notes: 'Last double-digit long run.' },
  '2026-10-03': { type: 'long', title: 'Taper Long Run — 12 mi', event: 'marathon', distanceMiles: 12, notes: 'Drop volume 30%.' },
  '2026-10-07': { type: 'mp', title: 'Short MP Run — 4 mi at MP', event: 'marathon', distanceMiles: 4, targetPace: '9:09/mi', notes: 'Last MP workout of the block.' },
  '2026-10-10': { type: 'long', title: 'Taper Long Run — 10 mi', event: 'marathon', distanceMiles: 10 },
  '2026-10-17': { type: 'long', title: 'Taper Long Run — 8 mi', event: 'marathon', distanceMiles: 8, notes: 'Easy only this week.' },

  // ─── MARATHON RACE WEEK (Oct 19-25) ───
  '2026-10-19': { type: 'easy', title: 'Race Week — Easy 4 mi', event: 'marathon', distanceMiles: 4 },
  '2026-10-20': { type: 'shakeout', title: 'Race Week — 3 mi easy + 4x400m at goal pace', event: 'marathon', distanceMiles: 3, targetPace: '9:09/mi (400m reps)', notes: 'Short strides at goal pace. Stay sharp.' },
  '2026-10-21': { type: 'rest', title: 'Race Week — Rest', event: 'marathon' },
  '2026-10-22': { type: 'easy', title: 'Race Week — Easy 3 mi', event: 'marathon', distanceMiles: 3 },
  '2026-10-23': { type: 'shakeout', title: 'Race Week — 2-3 mi shakeout', event: 'marathon', distanceMiles: 2.5, notes: 'Final shakeout. Stay loose.' },
  '2026-10-24': { type: 'rest', title: 'Complete Rest — Race Tomorrow', event: 'marathon', notes: 'Complete rest. Carb load. Gear laid out. Sleep early.' },
  '2026-10-25': { type: 'race', title: 'NIAGARA FALLS MARATHON — Sub-4:00', event: 'marathon', distanceMiles: 26.2, targetPace: '9:09/mi', notes: 'Miles 1-6: 9:20-9:30 (conservative). Miles 7-18: 9:05-9:15 (lock in). Miles 19-22: hold form. Miles 23-26.2: whatever you have left.' },
}

// ── Core functions (same signature as before) ──

function findPhase(dateStr: string): Phase | null {
  for (const phase of PHASES) {
    if (dateStr >= phase.start && dateStr <= phase.end) return phase
  }
  return null
}

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00')
  // Convert JS day (0=Sun) to our format (0=Mon)
  const jsDay = d.getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

export function getRunWorkout(dateStr: string): RunWorkout | null {
  // Date-specific overrides take priority
  if (DATE_WORKOUTS[dateStr]) return DATE_WORKOUTS[dateStr]

  // Fall back to phase template
  const phase = findPhase(dateStr)
  if (!phase) return null

  const dow = dayOfWeek(dateStr)
  return phase.template[dow] || null
}

export function getWeekInfo(dateStr: string): { week: number; phase: string; mileage: string; event: 'pc100' | 'marathon' } | null {
  const phase = findPhase(dateStr)
  if (!phase) return null

  // Calculate week number within the phase
  const start = new Date(phase.start + 'T12:00:00')
  const current = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000)
  const weekInPhase = Math.floor(diffDays / 7) + 1

  return {
    week: weekInPhase,
    phase: phase.phase,
    mileage: phase.mileage,
    event: phase.event,
  }
}
