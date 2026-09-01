import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatDate } from '../lib/format'
import type { Role, Staff } from '../lib/types'
import { Button, ErrorNote, Field, Input, PageHeader, Select, Spinner, Tag, tableClass, tdClass, thClass } from '../components/ui'

const EMPTY = { name: '', email: '', password: '', role: 'librarian' as Role }

export function StaffPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [removing, setRemoving] = useState<number | null>(null)

  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<{ staff: Staff[] }>('/staff') })

  const create = useMutation({
    mutationFn: () => api<{ staff: Staff }>('/staff', { method: 'POST', body: form }),
    onSuccess: ({ staff: created }) => {
      toast.success(`${created.name} can now sign in`)
      setForm(EMPTY)
      setErrors({})
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors()
        if (Object.keys(fields).length) return setErrors(fields)
        if (err.code === 'EMAIL_TAKEN') return setErrors({ email: err.message })
      }
      toast.error(err.message)
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => api(`/staff/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Account removed')
      setRemoving(null)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (err) => toast.error(err.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (form.name.trim().length < 2) found.name = 'Name is too short'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Enter a valid email address'
    if (form.password.length < 8) found.password = 'Use at least 8 characters'
    if (Object.keys(found).length) return setErrors(found)
    create.mutate()
  }

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: '' }))
  }

  return (
    <>
      <PageHeader title="Staff" subtitle="Who can sign in to the desk. Librarians issue, return and manage books; admins can also manage staff." />

      <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
        <section>
          {staff.isError ? (
            <ErrorNote error={staff.error} onRetry={() => staff.refetch()} />
          ) : !staff.data ? (
            <Spinner />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Name</th>
                    <th className={thClass}>Role</th>
                    <th className={`${thClass} hidden sm:table-cell`}>Since</th>
                    <th className={thClass}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staff.data.staff.map((s) => (
                    <tr key={s.id}>
                      <td className={tdClass}>
                        {s.name} {s.id === user?.id && <span className="text-xs text-ink-3">(you)</span>}
                        <p className="text-xs text-ink-3">{s.email}</p>
                      </td>
                      <td className={tdClass}>
                        <Tag tone={s.role === 'admin' ? 'yellow' : 'neutral'}>{s.role}</Tag>
                      </td>
                      <td className={`${tdClass} hidden text-ink-2 sm:table-cell`}>{formatDate(s.createdAt)}</td>
                      <td className={`${tdClass} text-right`}>
                        {s.id !== user?.id &&
                          (removing === s.id ? (
                            <span className="inline-flex gap-1">
                              <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate(s.id)}>
                                Remove
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                                Keep
                              </Button>
                            </span>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setRemoving(s.id)}>
                              Remove
                            </Button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="add-staff">
          <h2 id="add-staff" className="mb-4 font-display text-xl font-medium">
            Add someone
          </h2>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Name" htmlFor="staff-name" error={errors.name}>
              <Input id="staff-name" value={form.name} onChange={set('name')} aria-invalid={Boolean(errors.name)} autoComplete="off" />
            </Field>
            <Field label="Email" htmlFor="staff-email" error={errors.email}>
              <Input id="staff-email" type="email" value={form.email} onChange={set('email')} aria-invalid={Boolean(errors.email)} autoComplete="off" />
            </Field>
            <Field label="Temporary password" htmlFor="staff-password" error={errors.password} hint="At least 8 characters. Share it with them in person.">
              <Input id="staff-password" type="password" value={form.password} onChange={set('password')} aria-invalid={Boolean(errors.password)} autoComplete="new-password" />
            </Field>
            <Field label="Role" htmlFor="staff-role">
              <Select id="staff-role" value={form.role} onChange={set('role')}>
                <option value="librarian">Librarian</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit" variant="primary" busy={create.isPending}>
              Create account
            </Button>
          </form>
        </section>
      </div>
    </>
  )
}
