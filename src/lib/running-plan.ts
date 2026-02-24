// Sub-4 Hour Marathon Training Plan — Niagara Falls Oct 26, 2026
// 38-week plan starting Feb 3, 2026

export interface RunWorkout {
  type: 'easy' | 'long' | 'tempo' | 'intervals' | 'mp' | 'strength' | 'ma' | 'cross' | 'rest' | 'race'
  title: string
  notes?: string
}

const PLAN_START = new Date('2026-02-03T00:00:00') // Week 1 Monday

// Returns the workout for a given date, or null if outside the plan
export function getRunWorkout(dateStr: string): RunWorkout | null {
  const date = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.floor((date.getTime() - PLAN_START.getTime()) / 86400000)
  
  if (diffDays < 0 || diffDays >= 38 * 7) return null
  
  const week = Math.floor(diffDays / 7) + 1 // 1-indexed
  const dayOfWeek = diffDays % 7 // 0=Mon, 1=Tue, ..., 6=Sun

  const workout = PLAN[week]?.[dayOfWeek]
  return workout || null
}

export function getWeekInfo(dateStr: string): { week: number; phase: string; mileage: string } | null {
  const date = new Date(dateStr + 'T12:00:00')
  const diffDays = Math.floor((date.getTime() - PLAN_START.getTime()) / 86400000)
  if (diffDays < 0 || diffDays >= 38 * 7) return null
  const week = Math.floor(diffDays / 7) + 1
  return WEEK_META[week] || null
}

const WEEK_META: Record<number, { week: number; phase: string; mileage: string }> = {
  1: { week: 1, phase: 'Base Building', mileage: '~15 mi' },
  2: { week: 2, phase: 'Base Building', mileage: '~16 mi' },
  3: { week: 3, phase: 'Base Building', mileage: '~18 mi' },
  4: { week: 4, phase: 'Base Building (Recovery)', mileage: '~15 mi' },
  5: { week: 5, phase: 'Base Building', mileage: '~20 mi' },
  6: { week: 6, phase: 'Base Building', mileage: '~22 mi' },
  7: { week: 7, phase: 'Base Building', mileage: '~24 mi' },
  8: { week: 8, phase: 'Base Building (Recovery)', mileage: '~20 mi' },
  9: { week: 9, phase: 'Aerobic Dev', mileage: '~26 mi' },
  10: { week: 10, phase: 'Aerobic Dev', mileage: '~28 mi' },
  11: { week: 11, phase: 'Aerobic Dev', mileage: '~30 mi' },
  12: { week: 12, phase: 'Aerobic Dev (Recovery)', mileage: '~24 mi' },
  13: { week: 13, phase: 'Aerobic Dev', mileage: '~32 mi' },
  14: { week: 14, phase: 'Aerobic Dev', mileage: '~33 mi' },
  15: { week: 15, phase: 'Aerobic Dev', mileage: '~35 mi' },
  16: { week: 16, phase: 'Aerobic Dev (Recovery)', mileage: '~27 mi' },
  17: { week: 17, phase: 'Marathon Specific', mileage: '~35 mi' },
  18: { week: 18, phase: 'Marathon Specific', mileage: '~37 mi' },
  19: { week: 19, phase: 'Marathon Specific', mileage: '~38 mi' },
  20: { week: 20, phase: 'Marathon Specific (Recovery)', mileage: '~30 mi' },
  21: { week: 21, phase: 'Marathon Specific', mileage: '~40 mi' },
  22: { week: 22, phase: 'Marathon Specific', mileage: '~40 mi' },
  23: { week: 23, phase: 'Marathon Specific', mileage: '~42 mi' },
  24: { week: 24, phase: 'Marathon Specific (Recovery)', mileage: '~30 mi' },
  25: { week: 25, phase: 'Peak Training', mileage: '~43 mi' },
  26: { week: 26, phase: 'Peak Training', mileage: '~38 mi' },
  27: { week: 27, phase: 'Peak Training', mileage: '~43 mi' },
  28: { week: 28, phase: 'Peak Training (Recovery)', mileage: '~33 mi' },
  29: { week: 29, phase: 'Peak Training', mileage: '~44 mi' },
  30: { week: 30, phase: 'Peak Training', mileage: '~38 mi' },
  31: { week: 31, phase: 'Peak Training', mileage: '~40 mi' },
  32: { week: 32, phase: 'Peak Training', mileage: '~35 mi' },
  33: { week: 33, phase: 'Peak Training', mileage: '~32 mi' },
  34: { week: 34, phase: 'Taper', mileage: '~28 mi' },
  35: { week: 35, phase: 'Taper', mileage: '~24 mi' },
  36: { week: 36, phase: 'Taper', mileage: '~20 mi' },
  37: { week: 37, phase: 'Taper', mileage: '~15 mi' },
  38: { week: 38, phase: 'RACE WEEK', mileage: '~30 mi (inc. race)' },
}

// PLAN[week][dayOfWeek] — dayOfWeek: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
const PLAN: Record<number, Record<number, RunWorkout>> = {
  // ─── WEEK 1: Feb 3-9 ───
  1: {
    0: { type: 'easy', title: '🏃 3mi easy (10:30-11:00/mi)', notes: 'Conversational pace' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy shakeout', notes: 'Run AM, lift PM or vice versa' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling', notes: 'Cross-training' },
    3: { type: 'easy', title: '🏃 3mi easy (10:30-11:00/mi)', notes: 'Focus on relaxed form' },
    4: { type: 'rest', title: '😴 Rest or 20-min walk', notes: 'Recovery day' },
    5: { type: 'long', title: '🏃‍♂️ 5mi long run easy (11:00/mi)', notes: 'First long run baseline' },
    6: { type: 'ma', title: '🥊 MA/wrestling OR easy 2mi walk', notes: 'Active recovery' },
  },
  // ─── WEEK 2: Feb 10-16 ───
  2: {
    0: { type: 'easy', title: '🏃 3mi easy (10:30-11:00/mi)', notes: 'Smooth and relaxed' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'easy', title: '🏃 3.5mi easy', notes: 'Slight increase' },
    4: { type: 'rest', title: '😴 Rest or walk' },
    5: { type: 'long', title: '🏃‍♂️ 5.5mi long run (10:45-11:00/mi)', notes: 'Build gradually' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 3: Feb 17-23 ───
  3: {
    0: { type: 'easy', title: '🏃 3.5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling', notes: 'Moderate intensity' },
    3: { type: 'easy', title: '🏃 4mi easy (10:30/mi)', notes: 'Building volume' },
    4: { type: 'cross', title: '🧘 30-min walk or light yoga/stretch', notes: 'Active recovery' },
    5: { type: 'long', title: '🏃‍♂️ 6.5mi long run (10:45-11:00/mi)', notes: 'Longest run so far' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 4: Feb 24-Mar 1 (RECOVERY) ───
  4: {
    0: { type: 'easy', title: '🏃 3mi easy', notes: 'Recovery week — reduce 15-20%' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)', notes: 'Reduce intensity' },
    3: { type: 'easy', title: '🏃 3mi easy' },
    4: { type: 'rest', title: '😴 Full rest', notes: 'Let body adapt' },
    5: { type: 'long', title: '🏃‍♂️ 5mi easy', notes: 'Shorter recovery long run' },
    6: { type: 'rest', title: '😴 Rest or easy walk', notes: 'Full recovery' },
  },
  // ─── WEEK 5: Mar 2-8 ───
  5: {
    0: { type: 'easy', title: '🏃 4mi easy (10:15-10:30/mi)', notes: 'Pace improving naturally' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'easy', title: '🏃 4mi easy + 4x20s strides', notes: 'First strides!' },
    4: { type: 'rest', title: '😴 Rest or walk' },
    5: { type: 'long', title: '🏃‍♂️ 7mi long run (10:30-10:45/mi)', notes: 'Push long run up' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy 3mi', notes: 'Optional double' },
  },
  // ─── WEEK 6: Mar 9-15 ───
  6: {
    0: { type: 'easy', title: '🏃 4mi easy + 4x20s strides' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2.5mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'easy', title: '🏃 4.5mi easy + 6x20s strides' },
    4: { type: 'rest', title: '😴 Rest or 20-min walk' },
    5: { type: 'long', title: '🏃‍♂️ 8mi long run (10:30-10:45/mi)', notes: 'Comfortable endurance' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 7: Mar 16-22 ───
  7: {
    0: { type: 'easy', title: '🏃 4.5mi easy + 6x20s strides' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'easy', title: '🏃 4.5mi easy' },
    4: { type: 'cross', title: '🧘 30-min walk or light stretching' },
    5: { type: 'long', title: '🏃‍♂️ 9mi long run (10:15-10:30/mi)', notes: 'Single digits done!' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy walk' },
  },
  // ─── WEEK 8: Mar 23-29 (RECOVERY) ───
  8: {
    0: { type: 'easy', title: '🏃 3.5mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'easy', title: '🏃 3.5mi easy', notes: 'Test: run a timed 5K this week' },
    4: { type: 'rest', title: '😴 Full rest' },
    5: { type: 'long', title: '🏃‍♂️ 7mi easy', notes: 'Recovery long run' },
    6: { type: 'rest', title: '😴 Rest', notes: 'Prepare for Phase 2' },
  },
  // ─── WEEK 9: Mar 30-Apr 5 (AEROBIC DEV) ───
  9: {
    0: { type: 'easy', title: '🏃 4.5mi easy (10:00-10:15/mi)', notes: 'Pace dropping naturally' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 5mi: 1mi warm, 3mi @ 9:30/mi, 1mi cool', notes: 'First tempo! Controlled effort' },
    4: { type: 'rest', title: '😴 Rest or walk' },
    5: { type: 'long', title: '🏃‍♂️ 10mi long run (10:15-10:30/mi)', notes: 'Double digits! 🎉' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy 2mi' },
  },
  // ─── WEEK 10: Apr 6-12 ───
  10: {
    0: { type: 'easy', title: '🏃 5mi easy + 6x20s strides' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 5.5mi: 1mi warm, 3.5mi @ 9:20-9:30/mi, 1mi cool', notes: 'Tempo getting longer' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 10.5mi long run (10:15/mi)', notes: 'Steady and comfortable' },
    6: { type: 'cross', title: '🥊 MA/wrestling or 30-min easy walk' },
  },
  // ─── WEEK 11: Apr 13-19 ───
  11: {
    0: { type: 'easy', title: '🏃 5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 6mi: 1mi warm, 4mi @ 9:15-9:30/mi, 1mi cool', notes: 'Building tempo duration' },
    4: { type: 'rest', title: '😴 Rest or walk' },
    5: { type: 'long', title: '🏃‍♂️ 12mi long run (10:15-10:30/mi)', notes: 'Half marathon distance soon' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 12: Apr 20-26 (RECOVERY) ───
  12: {
    0: { type: 'easy', title: '🏃 4mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'easy', title: '🏃 4mi easy + strides', notes: 'No tempo this week' },
    4: { type: 'rest', title: '😴 Full rest' },
    5: { type: 'long', title: '🏃‍♂️ 9mi easy', notes: 'Shorter recovery long run' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 13: Apr 27-May 3 ───
  13: {
    0: { type: 'easy', title: '🏃 5mi easy (9:45-10:00/mi)', notes: 'Fitness building' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 6mi: 1.5 warm, 6x800m @ 8:30/mi (90s jog), 1.5 cool', notes: 'First speed work!' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 13.1mi half marathon test! (10:00-10:15/mi)', notes: 'Time yourself! 🏅' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy walk', notes: 'Easy after long run' },
  },
  // ─── WEEK 14: May 4-10 ───
  14: {
    0: { type: 'easy', title: '🏃 5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 7mi: 1.5 warm, 4mi @ 9:10-9:20/mi, 1.5 cool', notes: 'Sub-4 pace is 9:09' },
    4: { type: 'rest', title: '😴 Rest or walk' },
    5: { type: 'long', title: '🏃‍♂️ 14mi long run (10:00-10:15/mi)', notes: 'New long run PR' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 15: May 11-17 ───
  15: {
    0: { type: 'easy', title: '🏃 5mi easy + strides' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 7mi: 1.5 warm, 5x1000m @ 8:20-8:30/mi (2min jog), 1.5 cool', notes: 'Building speed endurance' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 15mi long run (10:00-10:15/mi)', notes: 'Keep it conversational' },
    6: { type: 'cross', title: '🥊 MA/wrestling or easy 30-min walk' },
  },
  // ─── WEEK 16: May 18-24 (RECOVERY) ───
  16: {
    0: { type: 'easy', title: '🏃 4mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'easy', title: '🏃 4mi easy + 8x20s strides' },
    4: { type: 'rest', title: '😴 Full rest' },
    5: { type: 'long', title: '🏃‍♂️ 10mi easy', notes: 'Easy recovery long run' },
    6: { type: 'rest', title: '😴 Rest', notes: 'Prep for Phase 3' },
  },
  // ─── WEEK 17: May 25-31 (MARATHON SPECIFIC) ───
  17: {
    0: { type: 'easy', title: '🏃 5mi easy (9:45-10:00/mi)' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'mp', title: '🎯 8mi: 2 warm, 4mi @ 9:05-9:10/mi (MP), 2 cool', notes: 'Marathon pace practice!' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 14mi: 12 easy + last 2 @ 9:30/mi', notes: 'Finish faster (negative split)' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy walk' },
  },
  // ─── WEEK 18: Jun 1-7 ───
  18: {
    0: { type: 'easy', title: '🏃 5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 8mi: 1.5 warm, 5mi @ 9:00-9:10/mi, 1.5 cool', notes: 'Sustaining MP effort' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 16mi long run (9:50-10:10/mi)', notes: 'Practice race nutrition' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 19: Jun 8-14 ───
  19: {
    0: { type: 'easy', title: '🏃 5mi easy + strides' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 8mi: 2 warm, 3x1600m @ 8:15-8:30/mi (2min jog), 2 cool', notes: 'Mile repeats!' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 17mi: 14 easy + last 3 @ 9:10-9:20/mi', notes: 'MP finish practice' },
    6: { type: 'cross', title: '🧘 Easy walk or light MA' },
  },
  // ─── WEEK 20: Jun 15-21 (RECOVERY) ───
  20: {
    0: { type: 'easy', title: '🏃 4mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'easy', title: '🏃 5mi easy + strides', notes: 'No hard workout' },
    4: { type: 'rest', title: '😴 Full rest' },
    5: { type: 'long', title: '🏃‍♂️ 12mi easy', notes: 'Recovery long run' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 21: Jun 22-28 ───
  21: {
    0: { type: 'easy', title: '🏃 5mi easy (9:30-9:45/mi)', notes: 'Pace improving' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'mp', title: '🎯 9mi: 2 warm, 5mi @ 9:00-9:09/mi, 2 cool', notes: 'Full marathon pace' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 18mi: 15 easy + last 3 @ 9:10/mi', notes: 'Longest run yet! Fuel every 45min' },
    6: { type: 'ma', title: '🥊 MA/wrestling (light) or rest' },
  },
  // ─── WEEK 22: Jun 29-Jul 5 ───
  22: {
    0: { type: 'easy', title: '🏃 5.5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 9mi: 2 warm, 5mi @ 8:50-9:05/mi, 2 cool', notes: 'Pushing sub-9 efforts' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 16mi easy (9:50-10:00/mi)', notes: 'Back off after 18' },
    6: { type: 'ma', title: '🥊 MA/wrestling or easy walk' },
  },
  // ─── WEEK 23: Jul 6-12 ───
  23: {
    0: { type: 'easy', title: '🏃 5.5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 9mi: 2 warm, 4x1600m @ 8:10-8:25/mi (2min jog), 2 cool', notes: 'Building top-end speed' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 19mi: 16 easy + last 3 @ 9:00-9:10/mi', notes: 'Near-peak long run' },
    6: { type: 'cross', title: '🧘 Easy walk or light stretching', notes: 'Big week — recover' },
  },
  // ─── WEEK 24: Jul 13-19 (RECOVERY) ───
  24: {
    0: { type: 'easy', title: '🏃 4mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'easy', title: '🏃 5mi easy + strides' },
    4: { type: 'rest', title: '😴 Full rest' },
    5: { type: 'long', title: '🏃‍♂️ 12mi easy', notes: 'Easy week before peak' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 25: Jul 20-26 (PEAK) ───
  25: {
    0: { type: 'easy', title: '🏃 6mi easy (9:30-9:45/mi)', notes: 'Peak block begins' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy', notes: 'Consider reducing lift intensity' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'mp', title: '🎯 10mi: 2 warm, 6mi @ 8:55-9:09/mi, 2 cool', notes: 'Race pace confidence builder' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 20mi: 17 easy + last 3 @ 9:00-9:10/mi', notes: 'THE 20-MILER! Rehearse race fuel 🏅' },
    6: { type: 'rest', title: '😴 Full rest — you earned it' },
  },
  // ─── WEEK 26: Jul 27-Aug 2 ───
  26: {
    0: { type: 'easy', title: '🏃 5mi easy', notes: 'Recover from 20-miler' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT (lighter) + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 8mi: 2 warm, 4mi @ 8:50-9:00/mi, 2 cool' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 15mi easy (9:45-10:00/mi)', notes: 'Lighter long run after 20' },
    6: { type: 'ma', title: '🥊 MA/wrestling or walk' },
  },
  // ─── WEEK 27: Aug 3-9 ───
  27: {
    0: { type: 'easy', title: '🏃 6mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 9mi: 2 warm, 6x1000m @ 8:10-8:20/mi (90s jog), 2 cool', notes: 'Sharp speed session' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 18mi: 14 easy + last 4 @ 9:00-9:10/mi', notes: 'MP finish — race simulation' },
    6: { type: 'cross', title: '🧘 Easy walk only' },
  },
  // ─── WEEK 28: Aug 10-16 (RECOVERY) ───
  28: {
    0: { type: 'easy', title: '🏃 4mi easy', notes: 'Recovery week' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 2mi easy' },
    2: { type: 'ma', title: '🥊 MA/wrestling (lighter)' },
    3: { type: 'mp', title: '🎯 7mi: 1.5 warm, 4mi @ 9:00-9:09/mi, 1.5 cool', notes: 'Keep legs turning' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 12mi easy' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 29: Aug 17-23 ───
  29: {
    0: { type: 'easy', title: '🏃 6mi easy (9:20-9:40/mi)', notes: 'Final big push' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'mp', title: '🎯 10mi: 2 warm, 6mi @ 8:50-9:05/mi, 2 cool', notes: 'Sub-9 pace feels manageable now' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 20mi: 16 easy + last 4 @ 9:00-9:10/mi', notes: 'FINAL 20-MILER. Full race rehearsal 🏅' },
    6: { type: 'rest', title: '😴 Full rest', notes: 'Last big effort done!' },
  },
  // ─── WEEK 30: Aug 24-30 ───
  30: {
    0: { type: 'easy', title: '🏃 5mi easy', notes: 'Recover from 20' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 8mi: 2 warm, 4mi @ 8:50-9:00/mi, 2 cool' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 16mi easy (9:40-10:00/mi)', notes: 'Last long one before taper' },
    6: { type: 'ma', title: '🥊 MA/wrestling or walk' },
  },
  // ─── WEEK 31: Aug 31-Sep 6 ───
  31: {
    0: { type: 'easy', title: '🏃 5.5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'intervals', title: '🔥 8mi: 2 warm, 5x1000m @ 8:00-8:15/mi (2min jog), 2 cool', notes: 'Sharp speed' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 16mi: 12 easy + last 4 @ 9:00-9:10/mi', notes: 'MP finish' },
    6: { type: 'cross', title: '🧘 Easy walk' },
  },
  // ─── WEEK 32: Sep 7-13 ───
  32: {
    0: { type: 'easy', title: '🏃 5mi easy', notes: 'Starting to wind down' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'mp', title: '🎯 8mi: 2 warm, 4mi @ 8:55-9:05/mi, 2 cool', notes: 'Race pace feels smooth' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 14mi easy (9:40-9:50/mi)', notes: 'Winding down long runs' },
    6: { type: 'ma', title: '🥊 MA/wrestling or rest' },
  },
  // ─── WEEK 33: Sep 14-20 ───
  33: {
    0: { type: 'easy', title: '🏃 5mi easy' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT + 3mi easy', notes: 'Last full strength session' },
    2: { type: 'ma', title: '🥊 Martial arts/wrestling' },
    3: { type: 'tempo', title: '⚡ 7mi: 1.5 warm, 4mi @ 8:50-9:00/mi, 1.5 cool', notes: 'Last hard tempo' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 12mi: 10 easy + 2 @ MP', notes: 'Taper long runs begin' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 34: Sep 21-27 (TAPER) ───
  34: {
    0: { type: 'easy', title: '🏃 5mi easy (9:20-9:30/mi)', notes: 'Taper begins — volume dropping' },
    1: { type: 'strength', title: '🏋️ Mentzer HIT (lighter) + 2mi easy', notes: 'Reduce weights 20%' },
    2: { type: 'ma', title: '🥊 MA/wrestling (reduced intensity)' },
    3: { type: 'mp', title: '🎯 7mi: 1.5 warm, 3mi @ 9:00-9:09/mi, 1.5 cool + strides', notes: 'Stay sharp at MP' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 10mi easy (9:30-9:45/mi)', notes: 'Shorter but comfortable' },
    6: { type: 'rest', title: '😴 Rest or light walk' },
  },
  // ─── WEEK 35: Sep 28-Oct 4 ───
  35: {
    0: { type: 'easy', title: '🏃 4mi easy + 6x20s strides', notes: 'Legs feeling springy' },
    1: { type: 'strength', title: '🏋️ Light maintenance lift + 2mi easy', notes: 'Bodyweight or 50% weight' },
    2: { type: 'ma', title: '🥊 MA/wrestling (light — technique only)', notes: 'No hard sparring' },
    3: { type: 'mp', title: '🎯 6mi: 1.5 warm, 2mi @ 8:55-9:05/mi, 1.5 cool + strides', notes: 'Short and sharp' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'long', title: '🏃‍♂️ 8mi easy (9:30-9:45/mi)', notes: 'Last double-digit weekend' },
    6: { type: 'rest', title: '😴 Rest' },
  },
  // ─── WEEK 36: Oct 5-11 ───
  36: {
    0: { type: 'easy', title: '🏃 4mi easy + strides' },
    1: { type: 'strength', title: '🏋️ Very light maintenance + 2mi easy', notes: 'Last lift before race' },
    2: { type: 'ma', title: '🥊 Light MA technique or rest', notes: 'Nothing strenuous' },
    3: { type: 'mp', title: '🎯 5mi: 1 warm, 2mi @ 9:00/mi, 1 cool + strides', notes: 'Stay locked in at MP' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'easy', title: '🏃 5mi easy (9:30/mi)', notes: 'Last real run before race week' },
    6: { type: 'rest', title: '😴 Rest or easy walk' },
  },
  // ─── WEEK 37: Oct 12-18 ───
  37: {
    0: { type: 'easy', title: '🏃 3mi easy + 4x20s strides', notes: 'Race week prep' },
    1: { type: 'rest', title: '😴 Rest or 20-min walk', notes: 'No strength this week' },
    2: { type: 'easy', title: '🏃 3mi easy + 4x strides', notes: 'Shake out legs' },
    3: { type: 'mp', title: '🎯 4mi: 1 warm, 2mi @ 9:00/mi, 1 cool', notes: 'Last MP check-in' },
    4: { type: 'rest', title: '😴 Rest' },
    5: { type: 'easy', title: '🏃 3mi easy + strides', notes: 'Short and smooth' },
    6: { type: 'rest', title: '😴 Full rest', notes: 'Legs loading up' },
  },
  // ─── WEEK 38: Oct 19-26 (RACE WEEK) ───
  38: {
    0: { type: 'easy', title: '🏃 2mi very easy + 4 strides', notes: 'Stay loose' },
    1: { type: 'easy', title: '🏃 2mi very easy', notes: 'Trust your training' },
    2: { type: 'rest', title: '😴 Full rest', notes: 'Carb loading begins' },
    3: { type: 'easy', title: '🏃 2mi easy + 4 strides', notes: 'Last shakeout run' },
    4: { type: 'rest', title: '😴 Full rest', notes: 'Lay out race kit tonight' },
    5: { type: 'rest', title: '😴 Full rest. Eat well. Sleep early.', notes: 'Pre-race: pasta/rice dinner' },
    6: { type: 'race', title: '🏁 NIAGARA FALLS MARATHON — SUB-4:00 GO TIME!', notes: 'Goal: 9:09/mi pace. You trained 38 weeks for this. GO GET IT! 🏅' },
  },
}
