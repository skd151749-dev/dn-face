import { Link } from 'react-router-dom'
import { ShieldCheck, ScanFace, Users, UtensilsCrossed, FileBarChart2, ArrowRight } from 'lucide-react'
import { useAuth } from '../App.jsx'

const FLOW_STEPS = [
  'Landing Page',
  'Login',
  'Dashboard',
  'Register User',
  'Scan Attendance',
  'Meal Count',
  'Reports',
  'Settings',
]

export default function Landing() {
  const { user } = useAuth()
  const primaryHref = user ? '/dashboard' : '/login'
  const primaryLabel = user ? 'Go To Dashboard' : 'Get Started'

  return (
    <div className="min-h-screen bg-mesh text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-red-700 flex items-center justify-center shadow-lg shadow-primary/30">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-widest">
                DN<span className="text-primary"> FACE</span>
              </h1>
              <p className="text-xs text-gray-500 font-mono">AI Attendance v1.0</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!user && (
              <Link to="/login" className="btn-secondary">
                Login
              </Link>
            )}
            <Link to={primaryHref} className="btn-primary flex items-center gap-2">
              {primaryLabel}
              <ArrowRight size={16} />
            </Link>
          </div>
        </header>

        {/* Hero */}
        <section className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            <p className="text-xs tracking-widest uppercase text-primary font-mono">DN FACE Platform</p>
            <h2 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
              AI Face Recognition Attendance and School Meal Monitoring
            </h2>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
              Register users, capture face data, scan attendance in real time, and track meal counts in one clean demo-ready system.
              Built for school competitions with a modern dark UI and fast setup.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to={primaryHref} className="btn-primary flex items-center gap-2">
                Start The Flow
                <ArrowRight size={16} />
              </Link>
              <a href="#flow" className="btn-secondary">
                View System Flow
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <FeatureCard icon={Users} title="User Registration" desc="Capture 5 face images and save embeddings." />
              <FeatureCard icon={ScanFace} title="Face Recognition" desc="Auto check-in and check-out with live camera." />
              <FeatureCard icon={UtensilsCrossed} title="Meal Count" desc="Count students in frame and save daily totals." />
              <FeatureCard icon={FileBarChart2} title="Reports" desc="Daily, weekly, monthly reports with Excel export." />
            </div>
          </div>

          <div className="glass-card p-6 sm:p-8">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Demo Ready</p>
            <h3 className="font-display text-2xl font-bold mb-3">System Highlights</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <p>Role based dashboards for admin and staff.</p>
              <p>Attendance status rules: Present, Late, Early Leave, Absent.</p>
              <p>Real time camera scanner with success and alert feedback.</p>
              <p>Clean export to Excel for attendance reports.</p>
            </div>

            <div className="mt-6 p-4 rounded-xl bg-dark-600/50 border border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Local URLs</p>
              <p className="text-sm font-mono text-white">Frontend: http://localhost:5173</p>
              <p className="text-sm font-mono text-white">Backend: http://localhost:8000</p>
            </div>
          </div>
        </section>

        {/* Flow */}
        <section id="flow" className="mt-16">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-500">Required Flow</p>
              <h3 className="font-display text-2xl font-bold">System Navigation Order</h3>
            </div>
            <Link to={primaryHref} className="btn-secondary">
              Follow The Flow
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            {FLOW_STEPS.map((step, idx) => (
              <div key={step} className="glass-card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{step}</p>
                  <p className="text-xs text-gray-500">Step {idx + 1}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="glass-card p-4 border border-white/5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-dark-600/50 border border-white/5 flex items-center justify-center">
          <Icon size={16} className="text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-gray-500">{desc}</p>
        </div>
      </div>
    </div>
  )
}
