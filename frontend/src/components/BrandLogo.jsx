import { useEffect, useMemo, useState } from 'react'

function FaceCircuitMark({ className = '' }) {
  return (
    <svg viewBox="0 0 180 180" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="180" height="180" rx="32" fill="url(#bg)" />
      <path d="M111 28c20 9 33 29 33 52 0 15-5 28-15 39-7 8-13 19-13 33v4" stroke="#0F4C81" strokeWidth="6" strokeLinecap="round" />
      <path d="M90 24c-22 6-38 26-40 49" stroke="#5AA8D6" strokeWidth="6" strokeLinecap="round" />
      <path d="M54 82h60" stroke="#0F4C81" strokeWidth="6" strokeLinecap="round" />
      <path d="M48 104h54" stroke="#5AA8D6" strokeWidth="6" strokeLinecap="round" />
      <path d="M66 128c11 18 29 28 49 28" stroke="#0F4C81" strokeWidth="6" strokeLinecap="round" />
      <path d="M102 48c20 0 38 16 38 36 0 13-5 22-15 30-7 6-12 14-13 22" stroke="#7E8A97" strokeWidth="4" strokeLinecap="round" />
      <path d="M84 38v34M60 44v42M36 56v26M124 46v22M146 60v18" stroke="#7E8A97" strokeWidth="4" strokeLinecap="round" />
      <path d="M28 56h28M20 104h34M18 134h42M126 76h30M112 104h48M120 134h28" stroke="#0F4C81" strokeWidth="4" strokeLinecap="round" />
      <circle cx="28" cy="56" r="7" fill="#0F4C81" />
      <circle cx="20" cy="104" r="7" fill="#4CC6F0" />
      <circle cx="18" cy="134" r="7" fill="#0F4C81" />
      <circle cx="60" cy="44" r="7" fill="#4CC6F0" />
      <circle cx="36" cy="56" r="7" fill="#7E8A97" />
      <circle cx="84" cy="38" r="7" fill="#7E8A97" />
      <circle cx="124" cy="46" r="7" fill="#4CC6F0" />
      <circle cx="146" cy="60" r="7" fill="#7E8A97" />
      <circle cx="156" cy="104" r="7" fill="#4CC6F0" />
      <circle cx="148" cy="134" r="7" fill="#7E8A97" />
      <defs>
        <linearGradient id="bg" x1="16" y1="16" x2="160" y2="164" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FBFF" />
          <stop offset="1" stopColor="#E7EEF6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function BrandLogo({ logoUrl = '', showText = true, compact = false }) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [logoUrl])

  const sizes = compact
    ? {
      img: 'w-12 h-12 p-1.5',
      mark: 'w-12 h-12 rounded-2xl',
      title: 'text-lg',
      tagline: 'text-[10px]',
    }
    : {
      img: 'w-16 h-16 p-2',
      mark: 'w-16 h-16 rounded-2xl',
      title: 'text-2xl',
      tagline: 'text-[11px]',
    }

  const shouldRenderImage = Boolean(logoUrl) && !imageFailed

  const imageNode = useMemo(() => {
    if (shouldRenderImage) {
      return (
        <img
          src={logoUrl}
          alt="DN FACE logo"
          onError={() => setImageFailed(true)}
          className={`object-contain rounded-2xl bg-white/95 shadow-lg shadow-cyan-500/10 ${sizes.img}`}
        />
      )
    }

    if (logoUrl && imageFailed) {
      return (
        <div className={`flex items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 font-display font-bold tracking-[0.24em] ${sizes.img}`}>
          DN
        </div>
      )
    }

    return <FaceCircuitMark className={sizes.mark} />
  }, [imageFailed, logoUrl, shouldRenderImage, sizes.img, sizes.mark])

  if (!showText && !(logoUrl && imageFailed)) return imageNode

  return (
    <div className="flex items-center gap-3">
      {imageNode}
      <div>
        <h1 className={`font-display font-bold tracking-[0.28em] text-white ${sizes.title}`}>
          DN <span className="text-cyan-300">FACE</span>
        </h1>
        <p className={`${sizes.tagline} uppercase tracking-[0.3em] text-slate-400`}>Secure Face Attendance</p>
      </div>
    </div>
  )
}
