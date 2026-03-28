const ENV_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')
const BASE = ENV_BASE || (import.meta.env.PROD ? '' : 'http://localhost:8000')
const GROUP_KEY = 'group'
const TOKEN_KEY = 'dnface_token'
const USER_KEY = 'dnface_user'
const SESSION_NOTICE_KEY = 'dnface_session_notice'

function currentGroup() {
  return localStorage.getItem(GROUP_KEY) || ''
}

function currentToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

function decodeBase64Url(value = '') {
  if (!value) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return atob(padded)
}

export function readTokenPayload(token = '') {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(decodeBase64Url(payload))
  } catch {
    return null
  }
}

export function isTokenExpired(token = '') {
  if (!token) return false
  const payload = readTokenPayload(token)
  if (!payload?.exp) return false
  return Date.now() >= payload.exp * 1000
}

export function clearStoredSession() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(GROUP_KEY)
}

export function popSessionNotice() {
  const notice = sessionStorage.getItem(SESSION_NOTICE_KEY) || ''
  if (notice) sessionStorage.removeItem(SESSION_NOTICE_KEY)
  return notice
}

function handleUnauthorized(message = 'Please sign in again.') {
  clearStoredSession()
  try {
    sessionStorage.setItem(
      SESSION_NOTICE_KEY,
      /expired/i.test(message) ? 'Your session expired. Please sign in again.' : 'Please sign in again to continue.',
    )
  } catch {}

  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }
}

function withGroup(data = {}) {
  const group = currentGroup()
  return group ? { ...data, group } : data
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

function resolveAssetUrl(path = '') {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${BASE}${path}`
}

async function request(method, path, body = null, options = {}) {
  const token = currentToken()
  const isFormData = options.isFormData === true
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const opts = { method, headers }
  if (body) {
    opts.body = isFormData ? body : JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, opts)
  } catch (err) {
    const locationLabel = BASE || (typeof window !== 'undefined' ? window.location.origin : 'the current origin')
    throw new Error(`Cannot reach server. Is the backend running at ${locationLabel}?`)
  }

  if (!res.ok) {
    let message = 'Request failed'
    try {
      const payload = await res.json()
      message = payload.detail || payload.message || message
    } catch (parseErr) {
      const text = await res.text().catch(() => '')
      if (text) message = text
    }
    if (res.status === 401 && path !== '/login') {
      handleUnauthorized(message)
    }
    throw new Error(message)
  }

  const contentType = res.headers.get('content-type') || ''
  return contentType.includes('application/json') ? res.json() : res.text()
}

async function downloadFile(path, params = {}, fallbackName = 'download.bin') {
  const query = new URLSearchParams(cleanParams(params)).toString()
  const url = `${BASE}${path}${query ? `?${query}` : ''}`
  const token = currentToken()
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!res.ok) {
    let message = 'Download failed'
    try {
      const err = await res.json()
      message = err.detail || err.message || message
    } catch (e) {
      const text = await res.text().catch(() => '')
      if (text) message = text
    }
    if (res.status === 401) {
      handleUnauthorized(message)
    }
    throw new Error(message)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/i)
  const filename = match ? match[1] : fallbackName

  const link = document.createElement('a')
  link.href = window.URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(link.href)
}

export const api = {
  resolveAssetUrl,
  login: (data) => request('POST', '/login', data),
  getBranding: () => request('GET', '/branding'),
  getGroups: () => request('GET', '/groups'),
  createGroup: (data) => request('POST', '/groups', data),
  updateGroup: (groupId, data) => request('PUT', `/groups/${groupId}`, data),
  deleteGroup: (groupId) => request('DELETE', `/groups/${groupId}`),
  uploadLogo: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('POST', '/branding/logo', formData, { isFormData: true })
  },
  registerUser: (data) => request('POST', '/register-user', data),
  registerFace: (data) => request('POST', '/register-face', data),
  scanAttendance: (data) => request('POST', '/scan-attendance', withGroup(data)),
  mealCount: (data) => request('POST', '/meal-count', withGroup(data)),
  getMealToday: () => {
    const group = currentGroup()
    const q = group ? `?group=${encodeURIComponent(group)}` : ''
    return request('GET', `/meal-count/today${q}`)
  },
  getMealMonitoring: (params = {}) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    return request('GET', `/meal-monitoring?${q}`)
  },
  dashboardStats: () => {
    const group = currentGroup()
    const q = group ? `?group=${encodeURIComponent(group)}` : ''
    return request('GET', `/dashboard-stats${q}`)
  },
  recentActivity: (params = {}) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    return request('GET', `/recent-activity?${q}`)
  },
  attendanceReport: (params) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    return request('GET', `/attendance-report?${q}`)
  },
  exportReport: (format, params = {}) => {
    const group = currentGroup()
    const payload = cleanParams(group ? { ...params, group, format } : { ...params, format })
    const extension = format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xlsx'
    return downloadFile('/export-report', payload, `attendance_report.${extension}`)
  },
  exportExcel: (params = {}) => api.exportReport('excel', params),
  getSettings: () => request('GET', '/settings'),
  saveSettings: (data) => request('POST', '/settings', data),
  getUsers: (params = {}) => {
    const requestedGroup = Object.prototype.hasOwnProperty.call(params, 'group') ? params.group : currentGroup()
    const q = new URLSearchParams(cleanParams(requestedGroup ? { ...params, group: requestedGroup } : params)).toString()
    const suffix = q ? `?${q}` : ''
    return request('GET', `/users${suffix}`)
  },
  getUserManagement: (params = {}) => {
    const requestedGroup = Object.prototype.hasOwnProperty.call(params, 'group') ? params.group : currentGroup()
    const q = new URLSearchParams(cleanParams(requestedGroup ? { ...params, group: requestedGroup } : params)).toString()
    const suffix = q ? `?${q}` : ''
    return request('GET', `/users/management${suffix}`)
  },
  deleteUser: (userId) => request('DELETE', `/users/${encodeURIComponent(userId)}`),
  createEarlyCheckoutRequest: (data) => request('POST', '/early-checkout-requests', withGroup(data)),
  getEarlyCheckoutRequests: (params = {}) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    return request('GET', `/early-checkout-requests?${q}`)
  },
  reviewEarlyCheckoutRequest: (requestId, status) =>
    request('POST', `/early-checkout-requests/${requestId}/review`, { status }),
  getNotifications: (params = {}) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    return request('GET', `/notifications?${q}`)
  },
  markNotificationsRead: (data = {}, params = {}) => {
    const group = currentGroup()
    const q = new URLSearchParams(cleanParams(group ? { ...params, group } : params)).toString()
    const suffix = q ? `?${q}` : ''
    return request('POST', `/notifications/read${suffix}`, data)
  },
}
