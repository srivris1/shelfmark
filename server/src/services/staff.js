import bcrypt from 'bcryptjs'
import { conflict, notFound } from '../lib/errors.js'



const DUMMY_HASH = bcrypt.hashSync('this-is-not-anyones-password', 10)

const toStaff = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
})

export async function createStaff(db, { name, email, password, role }, rounds = 10) {
  const passwordHash = await bcrypt.hash(password, rounds)
  try {
    const { rows } = await db.query(
      'INSERT INTO staff (name, email, password_hash, role) VALUES ($1, lower($2), $3, $4) RETURNING *',
      [name, email, passwordHash, role],
    )
    return toStaff(rows[0])
  } catch (err) {
    if (err.code === '23505') throw conflict('EMAIL_TAKEN', 'Someone on the team already uses that email.')
    throw err
  }
}

export async function verifyLogin(db, email, password) {
  const { rows } = await db.query('SELECT * FROM staff WHERE email = lower($1)', [email])
  const row = rows[0]
  const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH)
  return row && passwordOk ? toStaff(row) : null
}

export async function findStaffById(db, id) {
  const { rows } = await db.query('SELECT * FROM staff WHERE id = $1', [id])
  return rows[0] ? toStaff(rows[0]) : null
}

export async function listStaff(db) {
  const { rows } = await db.query('SELECT * FROM staff ORDER BY role, name')
  return rows.map(toStaff)
}

export async function deleteStaff(db, id, actingUserId) {
  if (id === actingUserId) throw conflict('CANNOT_DELETE_SELF', "You can't remove your own account.")
  const { rows } = await db.query('DELETE FROM staff WHERE id = $1 RETURNING id', [id])
  if (!rows[0]) throw notFound('STAFF_NOT_FOUND', 'That staff member no longer exists.')
}

export async function countStaff(db) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM staff')
  return rows[0].n
}
