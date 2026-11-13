// SQL for `race_courses` (migration 1758000000022): a route the rider
// attached and the race plan made for it — services/racePlans.js.
const { pool } = require('../db');

async function createCourse(userId, { name, source, course }, db = pool) {
  const result = await db.query(
    `INSERT INTO race_courses (user_id, name, source, course) VALUES ($1, $2, $3, $4)
     RETURNING id, name, source, course, plan, plan_options, created_at`,
    [userId, name, source, JSON.stringify(course)],
  );
  return result.rows[0];
}

/** One course of this rider, or null. */
async function getCourse(userId, id, db = pool) {
  const result = await db.query(
    'SELECT id, name, source, course, plan, plan_options, created_at FROM race_courses WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return result.rows[0] || null;
}

async function savePlan(userId, id, plan, options, db = pool) {
  await db.query(
    'UPDATE race_courses SET plan = $3, plan_options = $4, updated_at = NOW() WHERE id = $1 AND user_id = $2',
    [id, userId, JSON.stringify(plan), JSON.stringify(options)],
  );
}

/** The rider's latest courses, newest first — what the coach is reminded of on every turn. */
async function listRecentCourses(userId, limit = 5, db = pool) {
  const result = await db.query(
    `SELECT id, name, course->'distance_m' AS distance_m, course->'gain_m' AS gain_m,
            plan->'summary' AS plan_summary, created_at
     FROM race_courses WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

/** Deletes this rider's courses beyond the newest `keep`; returns how many went. */
async function pruneCourses(userId, keep, db = pool) {
  const result = await db.query(
    `DELETE FROM race_courses WHERE user_id = $1 AND id NOT IN (
       SELECT id FROM race_courses WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2)`,
    [userId, keep],
  );
  return result.rowCount;
}

/** Deletes courses nobody has touched for `days` days (uploaded or re-planned); returns how many went. */
async function deleteOlderThan(days, db = pool) {
  const result = await db.query(`DELETE FROM race_courses WHERE updated_at < NOW() - ($1 || ' days')::interval`, [String(days)]);
  return result.rowCount;
}

module.exports = { createCourse, getCourse, savePlan, listRecentCourses, pruneCourses, deleteOlderThan };
