import { useLocation } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import { Bell, Clock, ExternalLink, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../utils/api.js'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/scan':      'Face Recognition Scanner',
  '/meal':      'Meal Count Scanner',
  '/register':  'Register New User',
  '/reports':   'Attendance Reports',
  '/settings':  'System Settings',
}

export default function Navbar() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [time, setTime] = useState(new Date())
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeNotification, setActiveNotification] = useState(null)
  const bellButtonRef = useRef(null)
  const [menuPosition, setMenuPosition] = useState({ top: 72, right: 24, width: 320 })

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!user) return

    async function loadNotifications() {
      try {
        const res = await api.getNotifications({
          limit: 8,
          user_id: user.role === 'admin' ? undefined : user.user_id,
        })
        setNotifications(res.notifications || [])
        setUnreadCount((res.notifications || []).filter(n => !n.is_read).length)
      } catch (err) {
        // Keep navbar quiet if notifications are temporarily unavailable.
      }
    }

    loadNotifications()
    const timer = setInterval(loadNotifications, 10000)
    return () => clearInterval(timer)
  }, [user])

  useEffect(() => {
    if (!open) return undefined

    function updateMenuPosition() {
      const button = bellButtonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      setMenuPosition({
        top: rect.bottom + 12,
        right: Math.max(window.innerWidth - rect.right, 16),
        width: 320,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    return () => window.removeEventListener('resize', updateMenuPosition)
  }, [open])

  async function openNotification(item) {
    setActiveNotification(item)
    setOpen(false)

    if (item.is_read) return
    try {
      await api.markNotificationsRead(
        { notification_id: item.id },
        { user_id: user?.role === 'admin' ? undefined : user?.user_id },
      )
      setActiveNotification((prev) => (prev && prev.id === item.id ? { ...prev, is_read: 1 } : prev))
      setNotifications((prev) => prev.map((notification) => (
        notification.id === item.id ? { ...notification, is_read: 1 } : notification
      )))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (err) {
      // Quietly ignore temporary failures; the modal should still open.
    }
  }

  const title = PAGE_TITLES[pathname] || 'DN FACE'

  function renderNotificationDropdown() {
    if (!open || typeof document === 'undefined') return null
    return createPortal(
      <div className="fixed inset-0 z-[220]" onClick={() => setOpen(false)}>
        <div
          className="absolute inset-0 bg-transparent"
          aria-hidden="true"
        />
        <div
          className="absolute glass-card w-80 p-4 shadow-2xl"
          style={{ top: `${menuPosition.top}px`, right: `${menuPosition.right}px`, width: `${menuPosition.width}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              <p className="text-xs text-gray-500">{unreadCount} unread</p>
            </div>
            <button
              onClick={async () => {
                await api.markNotificationsRead(
                  {},
                  { user_id: user?.role === 'admin' ? undefined : user?.user_id },
                )
                setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
                setUnreadCount(0)
              }}
              className="text-xs text-primary hover:text-white transition-colors"
            >
              Mark all read
            </button>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">No notifications yet</p>
            ) : notifications.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  item.is_read ? 'border-white/5 bg-white/0' : 'border-primary/20 bg-primary/5'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">{item.type}</span>
                  <span className="text-[10px] text-gray-600">{item.created_at}</span>
                </div>
                <p className="mt-1 text-xs text-gray-200">{item.message}</p>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-300">
                  Open details
                  <ExternalLink size={11} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  function renderNotificationModal() {
    if (!activeNotification || typeof document === 'undefined') return null
    return createPortal(
      <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="glass-card relative max-h-[80vh] w-full max-w-lg overflow-y-auto p-6 shadow-2xl">
          <button
            type="button"
            onClick={() => setActiveNotification(null)}
            className="absolute right-4 top-4 rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
          >
            <X size={16} />
          </button>

          <div className="pr-10">
            <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">{activeNotification.type}</p>
            <h3 className="mt-2 font-display text-2xl text-white">Notification Details</h3>
            <p className="mt-1 text-sm text-slate-400">{activeNotification.created_at}</p>
          </div>

          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-base leading-7 text-slate-100">{activeNotification.message}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MetaPill label="Status" value={activeNotification.is_read ? 'Read' : 'Unread'} />
            <MetaPill label="Notification ID" value={activeNotification.id} />
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => setActiveNotification(null)} className="btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <>
      <header className="relative z-40 h-16 flex items-center justify-between px-6 border-b border-white/5 bg-dark-800/60 backdrop-blur-xl">
      <div>
        <h2 className="font-display text-lg font-semibold text-white tracking-wide">{title}</h2>
        <p className="text-xs text-gray-500">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="flex items-center gap-4">
        {/* Live clock */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-500/50 border border-white/5">
          <Clock size={14} className="text-primary" />
          <span className="font-mono text-sm text-white">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </span>
        </div>

        {/* Notification bell */}
        <div className="relative">
          <button
            ref={bellButtonRef}
            onClick={() => setOpen(v => !v)}
            className="relative w-9 h-9 rounded-xl bg-dark-500/50 border border-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] text-white flex items-center justify-center">
                {Math.min(unreadCount, 9)}
              </span>
            )}
          </button>

        </div>

        {/* Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/80 to-red-700/80 flex items-center justify-center text-white font-display font-bold text-sm shadow-lg shadow-primary/20">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-white leading-none">{user?.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user?.class_dept}</p>
          </div>
        </div>
      </div>
      </header>
      {renderNotificationDropdown()}
      {renderNotificationModal()}
    </>
  )
}

function MetaPill({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
