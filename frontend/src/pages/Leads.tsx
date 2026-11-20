import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowDownToLine,
  BookOpen,
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  FileClock,
  FileSpreadsheet,
  FolderOpen,
  Layers3,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  limits,
  statuses,
  type AdminUser,
  type Job,
  type Lead,
  type Pagination,
  type Field,
} from '../../../shared/leads'
import { api, client, download, message, pageApi, refreshLeads } from '../services/api'
import { useListState } from '../hooks/useListState'
import { Dialog } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Brand } from '../components/Brand'
import { LeadTable } from '../components/LeadTable'
import { LeadForm } from '../components/LeadForm'
import { History } from '../components/History'
import { ImportDialog } from '../components/ImportDialog'

type Modal =
  | { kind: 'add' | 'import' | 'history' | 'nav' }
  | { kind: 'edit' | 'delete'; lead: Lead }
  | { kind: 'result'; job: Job }

export function Leads({ user }: { user: AdminUser }) {
  const { value, change, key } = useListState()
  const [modal, setModal] = useState<Modal | null>(null)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState(value.search)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const leads = useQuery({
    queryKey: ['leads', key],
    queryFn: ({ signal }) =>
      pageApi<{ data: Lead[]; pagination: Pagination }>('/leads?' + key, signal),
  })
  const filters = useQuery({
    queryKey: ['filters'],
    queryFn: () => api<{ categories: string[]; cities: string[] }>('/leads/filters'),
  })
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () =>
      api<{ total: number; categories: number; statuses: Record<string, number> }>(
        '/leads/stats',
      ),
  })

  const page = leads.data?.pagination

  useEffect(() => {
    setSearch(value.search)
    return () => clearTimeout(timer.current)
  }, [key, value.search])

  useEffect(() => {
    if (page && page.page !== value.page) change({ page: page.page }, true)
  }, [page, value.page])

  function setSearchTerm(text: string) {
    setSearch(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => change({ search: text, page: 1 }), 350)
  }

  function sort(field: Field) {
    change({
      sort: field,
      direction: value.sort === field && value.direction === 'asc' ? 'desc' : 'asc',
      page: 1,
    })
  }

  async function logout() {
    setBusy(true)
    try {
      await api('/auth/logout', { method: 'POST' })
      client.clear()
      client.setQueryData(['session'], null)
    } catch (e) {
      toast.error(message(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove(lead: Lead) {
    setBusy(true)
    try {
      await api('/leads/' + lead.id, { method: 'DELETE' })
      setModal(null)
      await refreshLeads()
      toast.success('Lead deleted')
    } catch (e) {
      toast.error(message(e))
    } finally {
      setBusy(false)
    }
  }

  const close = () => setModal(null)

  /* ---------------- Navigation (shared by sidebar + mobile drawer) ---------------- */
  const nav = (
    <nav aria-label="Workspace navigation" className="flex flex-col gap-1">
      <button className="nav-link selected" onClick={close}>
        <BookOpen /> Lead directory
      </button>
      <button className="nav-link" onClick={() => setModal({ kind: 'history' })}>
        <FileClock /> Import history
      </button>
      <div className="nav-divider" />
      <button
        className="nav-link"
        onClick={() => {
          void download('/leads/template', 'manufacturer-leads-template.xlsx')
          close()
        }}
      >
        <FileSpreadsheet /> Excel template <ArrowDownToLine size={14} />
      </button>
    </nav>
  )

  /* ---------------- Stat cards ---------------- */
  const cards = [
    { label: 'Total leads', value: stats.data?.total, icon: Building2, tone: 'blue' },
    {
      label: 'In progress',
      value: stats.data?.statuses['In Progress'] || 0,
      icon: Activity,
      tone: 'orange',
    },
    { label: 'Converted', value: stats.data?.statuses.Converted || 0, icon: CheckCheck, tone: 'green' },
    { label: 'Categories', value: stats.data?.categories, icon: Layers3, tone: 'purple' },
  ]

  const filtered = !!(value.search || value.category || value.city || value.status)
  const pages = page
    ? [...new Set([1, page.page - 1, page.page, page.page + 1, page.totalPages])]
        .filter((p) => p >= 1 && p <= page.totalPages)
        .sort((a, b) => a - b)
    : []

  return (
    <div className="workspace">
      {/* ========================= SIDEBAR (desktop only) ========================= */}
      <aside className="sidebar hidden lg:flex">
        <Brand />
        {nav}
        <div className="sidebar-foot">
          <span className="workspace-icon">
            <LayoutGrid size={17} />
          </span>
          Manufacturer workspace
        </div>
      </aside>

      {/* ========================= MAIN COLUMN ========================= */}
      <div className="main-column min-w-0 flex-1">
        {/* -------------------------- TOP BAR -------------------------- */}
        <header className="topbar sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-white/95 px-3 py-2 backdrop-blur sm:px-4 md:px-6">
          <div className="crumb flex min-w-0 items-center gap-1.5 text-sm">
            <button
              className="icon-button lg:hidden"
              aria-label="Open navigation"
              onClick={() => setModal({ kind: 'nav' })}
            >
              <Menu size={21} />
            </button>
            <LayoutGrid size={16} className="hidden sm:block" />
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight size={14} className="hidden sm:block" />
            <b className="truncate">Lead directory</b>
          </div>

          <div className="admin-block ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block leading-tight">
              <small className="block max-w-[180px] truncate text-xs text-gray-500">
                {user.email}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Log out"
              title="Log out"
              disabled={busy}
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* -------------------------- CONTENT -------------------------- */}
        <main className="content mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:px-4 sm:py-6 md:px-6 lg:px-8">
          {/* Page heading */}
          <section className="page-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="heading-line" />
              <h1 className="truncate text-xl font-semibold sm:text-2xl lg:text-3xl">
                Manufacturer leads
              </h1>
            </div>
            <div className="heading-actions flex w-full gap-2 sm:w-auto">
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setModal({ kind: 'import' })}
              >
                <Upload /> Bulk import
              </Button>
              <Button
                variant="primary"
                className="flex-1 sm:flex-none"
                onClick={() => setModal({ kind: 'add' })}
              >
                <Plus /> Add lead
              </Button>
            </div>
          </section>

          {/* Stat cards */}
          <div className="stats-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div
                className={'stat ' + c.tone + ' flex items-center gap-3 rounded-xl border p-4'}
                key={c.label}
              >
                <span className="stat-icon shrink-0">
                  <c.icon size={21} />
                </span>
                <div className="min-w-0">
                  <span className="block truncate text-xs text-gray-500">{c.label}</span>
                  <strong className="block text-lg sm:text-xl">
                    {stats.isPending
                      ? '…'
                      : stats.isError
                        ? '—'
                        : c.value?.toLocaleString()}
                  </strong>
                </div>
              </div>
            ))}
          </div>

          {stats.isError && (
            <Button variant="ghost" onClick={() => stats.refetch()}>
              Retry lead totals
            </Button>
          )}

          {/* ---------------- TABLE CARD ---------------- */}
          <section className="table-card overflow-hidden rounded-xl border bg-white">
            <header className="card-heading flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <FolderOpen size={20} /> Lead directory
              </h2>
              <Button
                className="w-full sm:w-auto"
                onClick={() =>
                  download('/leads/export?' + key, 'manufacturer-leads.xlsx')
                }
              >
                <Download /> Export Excel
              </Button>
            </header>

            {/* ------------------- FILTER BAR ------------------- */}
            <div className="filter-bar flex flex-col gap-2 border-b p-4 sm:flex-row sm:flex-wrap sm:items-center">
              {/* Search */}
              <div className="search-field relative w-full sm:flex-1 sm:min-w-[220px]">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  aria-label="Search leads"
                  value={search}
                  maxLength={300}
                  placeholder="Search leads…"
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      clearTimeout(timer.current)
                      change({ search, page: 1 })
                    }
                  }}
                  className="w-full rounded-lg border py-2 pl-9 pr-9 text-sm"
                />
                {search && (
                  <button
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setSearchTerm('')}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Selects */}
              <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                {(['category', 'city', 'status'] as const).map((f) => (
                  <div className="filter-select relative w-full sm:w-auto" key={f}>
                    <select
                      aria-label={'Filter by ' + f}
                      value={value[f]}
                      onChange={(e) => change({ [f]: e.target.value, page: 1 })}
                      className="w-full appearance-none rounded-lg border py-2 pl-3 pr-8 text-sm sm:w-auto"
                    >
                      <option value="">
                        {f === 'category'
                          ? 'All categories'
                          : f === 'city'
                            ? 'All cities'
                            : 'All statuses'}
                      </option>
                      {[
                        ...new Set([
                          ...(f === 'status'
                            ? statuses
                            : f === 'city'
                              ? filters.data?.cities || []
                              : filters.data?.categories || []),
                          ...(value[f] ? [value[f]] : []),
                        ]),
                      ].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                ))}
              </div>

              {filtered && (
                <button
                  className="clear-filter w-full rounded-lg border px-3 py-2 text-sm sm:w-auto"
                  onClick={() => {
                    clearTimeout(timer.current)
                    setSearch('')
                    change({ search: '', category: '', city: '', status: '', page: 1 })
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {filters.isError && (
              <div className="p-4">
                <Button variant="ghost" onClick={() => filters.refetch()}>
                  Retry filter options
                </Button>
              </div>
            )}

            {/* ------------------- TABLE / EMPTY ------------------- */}
            {leads.isError ? (
              <div className="empty flex flex-col items-center gap-3 p-8 text-center" role="alert">
                <p className="text-sm text-gray-600">{message(leads.error)}</p>
                <Button onClick={() => leads.refetch()}>Retry</Button>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <LeadTable
                  rows={leads.data?.data || []}
                  options={value}
                  loading={leads.isPending}
                  onSort={sort}
                  onEdit={(lead) => setModal({ kind: 'edit', lead })}
                  onDelete={(lead) => setModal({ kind: 'delete', lead })}
                />
              </div>
            )}

            {/* ------------------- PAGINATION ------------------- */}
            <footer className="pagination flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                <span>
                  {page
                    ? 'Showing ' +
                      (page.total
                        ? (page.page - 1) * page.limit + 1
                        : 0) +
                      '–' +
                      Math.min(page.page * page.limit, page.total) +
                      ' of ' +
                      page.total.toLocaleString() +
                      ' records'
                    : 'Loading records…'}
                </span>
                <label className="flex items-center gap-1.5">
                  Rows{' '}
                  <select
                    aria-label="Rows per page"
                    value={value.limit}
                    onChange={(e) =>
                      change({ limit: Number(e.target.value), page: 1 })
                    }
                    className="rounded border px-2 py-1"
                  >
                    {limits.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>

              <nav
                aria-label="Pagination"
                className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end"
              >
                <button
                  aria-label="Previous page"
                  disabled={!page?.hasPreviousPage}
                  onClick={() => change({ page: value.page - 1 })}
                  className="rounded border p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className="flex items-center gap-1">
                  {pages.map((p, i) => (
                    <span key={p} className="flex items-center gap-1">
                      {i > 0 && p - pages[i - 1] > 1 && (
                        <i className="px-1 text-gray-400">…</i>
                      )}
                      <button
                        aria-label={'Page ' + p}
                        aria-current={p === page?.page ? 'page' : undefined}
                        onClick={() => change({ page: p })}
                        className={`rounded border px-2.5 py-1 text-sm ${
                          p === page?.page
                            ? 'bg-blue-600 text-white'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                </div>

                <button
                  aria-label="Next page"
                  disabled={!page?.hasNextPage}
                  onClick={() => change({ page: value.page + 1 })}
                  className="rounded border p-1.5 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </nav>
            </footer>
          </section>
        </main>
      </div>

      {/* ========================= MODALS ========================= */}

      {modal?.kind === 'nav' && (
        <Dialog title="Manufacturer Leads" onClose={close}>
          <div className="mobile-nav p-2">{nav}</div>
        </Dialog>
      )}

      {(modal?.kind === 'add' || modal?.kind === 'edit') && (
        <LeadForm
          lead={modal.kind === 'edit' ? modal.lead : undefined}
          categories={filters.data?.categories || []}
          onClose={close}
        />
      )}

      {modal?.kind === 'delete' && (
        <Dialog title="Delete lead?" onClose={close}>
          <div className="dialog-body p-4">
            <p className="text-sm text-gray-700">
              Delete <strong>{modal.lead.brandName}</strong> from the manufacturer
              directory? This removes the record permanently.
            </p>
          </div>
          <footer className="dialog-foot flex flex-col-reverse gap-2 p-4 sm:flex-row sm:justify-end">
            <Button onClick={close}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => remove(modal.lead)}>
              Delete lead
            </Button>
          </footer>
        </Dialog>
      )}

      {modal?.kind === 'history' && (
        <History onClose={close} onSelect={(job) => setModal({ kind: 'result', job })} />
      )}

      {(modal?.kind === 'import' || modal?.kind === 'result') && (
        <ImportDialog
          initialJob={modal.kind === 'result' ? modal.job : undefined}
          onClose={close}
        />
      )}
    </div>
  )
}