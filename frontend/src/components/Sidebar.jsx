import { NavLink } from 'react-router-dom'
import {
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  ScanFace,
  Shapes,
  UserPlus,
  UtensilsCrossed,
} from 'lucide-react'

import { useAuth, useBranding } from '../App.jsx'
import BrandLogo from './BrandLogo.jsx'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', adminOnly: true },
  { to: '/register', icon: UserPlus, label: 'Students', adminOnly: true },
  { to: '/scan', icon: ScanFace, label: 'Face Scan' },
  { to: '/meal', icon: UtensilsCrossed, label: 'Meal Monitoring', adminOnly: true },
  { to: '/reports', icon: FileBarChart2, label: 'Reports', adminOnly: true },
  { to: '/settings', icon: Shapes, label: 'System Control', adminOnly: true },
]

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { branding } = useBranding()
  const group = localStorage.getItem('group')

  return (
    <aside className="w-24 md:w-72 flex flex-col border-r border-white/5 bg-dark-800/85 backdrop-blur-xl">
      <div className="px-6 py-6 border-b border-white/5">
        <div className="hidden md:block">
          <BrandLogo logoUrl={branding.logo_url} showText compact />
        </div>
        <div className="md:hidden flex justify-center">
          <BrandLogo logoUrl={branding.logo_url} showText={false} compact />
        </div>
      </div>

      <div className="mx-3 md:mx-4 mt-5 p-3 md:p-4 rounded-2xl bg-white/[0.03] border border-white/8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500 mb-2">Logged in as</p>
        <p className="font-semibold text-white text-sm md:text-base truncate hidden md:block">{user?.name}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className={`text-[11px] px-2.5 py-1 rounded-full font-mono tracking-wider ${
            user?.role === 'admin' ? 'bg-primary/15 text-primary' : 'bg-cyan-400/10 text-cyan-300'
          }`}>
            {user?.role?.toUpperCase()}
          </span>
          {group && <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-slate-300 hidden md:inline-flex">{group}</span>}
        </div>
      </div>

      <nav className="flex-1 px-3 mt-5 space-y-1.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, adminOnly }) => {
          if (adminOnly && user?.role !== 'admin') return null
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 group ${
                isActive
                  ? 'bg-primary/12 text-white border-primary/20 shadow-[0_0_0_1px_rgba(233,69,96,0.08)]'
                  : 'text-slate-400 border-transparent hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? 'text-cyan-300' : 'text-slate-500 group-hover:text-white'} />
                  <span className="font-body text-sm hidden md:inline">{label}</span>
                  {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(76,198,240,0.7)]" />}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all text-sm"
        >
          <LogOut size={18} />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
