export default function StatsCard({ title, value, icon: Icon, color = 'primary', trend, subtitle }) {
  const colorMap = {
    primary: {
      bg: 'from-primary/20 to-red-900/10',
      border: 'border-primary/20',
      icon: 'text-primary bg-primary/15',
      glow: 'shadow-primary/15',
    },
    cyan: {
      bg: 'from-cyan-500/15 to-blue-900/10',
      border: 'border-cyan-500/20',
      icon: 'text-cyan-400 bg-cyan-500/15',
      glow: 'shadow-cyan-500/10',
    },
    green: {
      bg: 'from-green-500/15 to-emerald-900/10',
      border: 'border-green-500/20',
      icon: 'text-green-400 bg-green-500/15',
      glow: 'shadow-green-500/10',
    },
    orange: {
      bg: 'from-orange-500/15 to-yellow-900/10',
      border: 'border-orange-500/20',
      icon: 'text-orange-400 bg-orange-500/15',
      glow: 'shadow-orange-500/10',
    },
  }

  const c = colorMap[color] || colorMap.primary

  return (
    <div className={`glass-card p-5 bg-gradient-to-br ${c.bg} border ${c.border} shadow-lg ${c.glow} animate-slide-up`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-mono mb-2">{title}</p>
          <p className="text-4xl font-display font-bold text-white">{value ?? '—'}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${c.icon} shadow-inner`}>
          <Icon size={22} />
        </div>
      </div>

      {trend !== undefined && (
        <div className="mt-4 flex items-center gap-1.5">
          <span className={`text-xs font-mono ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
          <span className="text-xs text-gray-600">vs yesterday</span>
        </div>
      )}
    </div>
  )
}
