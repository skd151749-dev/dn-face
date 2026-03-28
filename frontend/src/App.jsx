import { Routes, Route, Navigate } from 'react-router-dom'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import SelectGroup from './pages/SelectGroup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import RegisterUser from './pages/RegisterUser.jsx'
import ScanAttendance from './pages/ScanAttendance.jsx'
import MealCount from './pages/MealCount.jsx'
import Reports from './pages/Reports.jsx'
import Settings from './pages/Settings.jsx'
import Layout from './components/Layout.jsx'
import { api, clearStoredSession, isTokenExpired } from './utils/api.js'

export const AuthContext = createContext(null)
export const BrandingContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function useBranding() {
  return useContext(BrandingContext)
}

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/scan" replace />
  return children
}

function GroupRoute({ children }) {
  const group = localStorage.getItem('group')
  if (!group) return <Navigate to="/select-group" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(() => {
    const savedToken = localStorage.getItem('dnface_token')
    if (savedToken && isTokenExpired(savedToken)) {
      clearStoredSession()
      return null
    }
    const saved = localStorage.getItem('dnface_user')
    try {
      return saved ? JSON.parse(saved) : null
    } catch {
      clearStoredSession()
      return null
    }
  })
  const [token, setToken] = useState(() => {
    const savedToken = localStorage.getItem('dnface_token')
    if (savedToken && isTokenExpired(savedToken)) {
      clearStoredSession()
      return ''
    }
    return savedToken || ''
  })
  const [branding, setBranding] = useState({ app_name: 'DN FACE', logo_url: '' })

  useEffect(() => {
    api.getBranding()
      .then((data) => setBranding({
        app_name: data.app_name || 'DN FACE',
        logo_url: data.logo_url || '',
      }))
      .catch(() => {})
  }, [])

  function login(userData, authToken) {
    setUser(userData)
    localStorage.setItem('dnface_user', JSON.stringify(userData))
    localStorage.removeItem('group')
    setToken(authToken || '')
    if (authToken) localStorage.setItem('dnface_token', authToken)
  }

  function logout() {
    setUser(null)
    setToken(null)
    clearStoredSession()
  }

  const authValue = useMemo(() => ({ user, token, login, logout }), [user, token])
  const brandingValue = useMemo(() => ({
    branding,
    refreshBranding: async () => {
      const data = await api.getBranding()
      setBranding({
        app_name: data.app_name || 'DN FACE',
        logo_url: data.logo_url || '',
      })
      return data
    },
  }), [branding])

  return (
    <BrandingContext.Provider value={brandingValue}>
      <AuthContext.Provider value={authValue}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/select-group"
            element={(
              <ProtectedRoute>
                <SelectGroup />
              </ProtectedRoute>
            )}
          />
          <Route
            element={(
              <ProtectedRoute>
                <GroupRoute>
                  <Layout />
                </GroupRoute>
              </ProtectedRoute>
            )}
          >
            <Route path="/dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
            <Route path="/register" element={<AdminRoute><RegisterUser /></AdminRoute>} />
            <Route path="/scan" element={<ScanAttendance />} />
            <Route path="/meal" element={<AdminRoute><MealCount /></AdminRoute>} />
            <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
            <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthContext.Provider>
    </BrandingContext.Provider>
  )
}
