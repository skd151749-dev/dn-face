import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Camera,
  Loader2,
  ScanFace,
  SunMedium,
} from 'lucide-react'

const AUTO_CAPTURE_STREAK = 3
const LIVENESS_FRAME_COUNT = 5
const LIVENESS_FRAME_DELAY = 150
const CAPTURE_WIDTH = 640
const ANALYSIS_WIDTH = 320
const ANALYSIS_HEIGHT = 240
const LIGHT_THRESHOLD = 52
const CENTER_THRESHOLD = 0.15
const FACE_SIZE_THRESHOLD = 0.19

const CHALLENGES = [
  'Blink once when scanning starts',
  'Move your head slightly left or right',
  'Keep your face inside the scan frame',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripDataPrefix(dataUrl) {
  if (!dataUrl) return ''
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function formatResult(result, mode) {
  if (!result) return null

  const action = result.action || ''
  if (action === 'wait_for_next_window' || action === 'window_closed' || action === 'too_early') {
    return {
      tone: 'amber',
      title: 'Schedule notice',
      message: result.message || 'Please wait for the next attendance window.',
    }
  }

  if (result.matched === false) {
    return {
      tone: 'red',
      title: result.action === 'liveness_failed' ? 'Scan rejected' : 'Scan not accepted',
      message: result.message || 'Unable to verify the face.',
    }
  }

  if (action === 'checkin' || action === 'morning_checkin' || action === 'afternoon_checkin') {
    const sessionLabel = action === 'afternoon_checkin' ? 'afternoon' : action === 'morning_checkin' ? 'morning' : ''
    return {
      tone: 'green',
      title: `${result.user?.name || 'User'} checked in${sessionLabel ? ` (${sessionLabel})` : ''}`,
      message: `Status: ${result.status || result.late_status || 'On Time'}${result.time ? ` at ${result.time}` : ''}`,
    }
  }
  if (action === 'checkout' || action === 'morning_checkout' || action === 'afternoon_checkout') {
    const sessionLabel = action === 'afternoon_checkout' ? 'afternoon' : action === 'morning_checkout' ? 'morning' : ''
    return {
      tone: 'cyan',
      title: `${result.user?.name || 'User'} checked out${sessionLabel ? ` (${sessionLabel})` : ''}`,
      message: `Status: ${result.status || 'On Time'}${result.time ? ` at ${result.time}` : ''}`,
    }
  }
  if (action === 'already_done') {
    return {
      tone: 'amber',
      title: 'Attendance already completed',
      message: result.message || 'This user already checked in and out today.',
    }
  }
  if (action === 'request_required' || action === 'request_pending') {
    return {
      tone: 'amber',
      title: 'Approval required',
      message: result.message || 'Early checkout needs admin approval.',
    }
  }
  if (mode === 'meal' && result.matched) {
    return {
      tone: 'green',
      title: 'Meal verified',
      message: `${result.verified || 0} new verification${result.verified === 1 ? '' : 's'} recorded.`,
    }
  }
  if (result.matched) {
    return {
      tone: 'green',
      title: result.user?.name ? `${result.user.name} verified` : 'Verification successful',
      message: result.message || 'Face recognition completed successfully.',
    }
  }

  return null
}

function resultToneClasses(tone) {
  switch (tone) {
    case 'green':
      return 'border-green-400/30 bg-green-400/10 text-green-200'
    case 'cyan':
      return 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'
    case 'amber':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
    default:
      return 'border-red-400/30 bg-red-400/10 text-red-100'
  }
}

export default function CameraScanner({
  onCapture,
  result,
  scanning = false,
  mode = 'attendance',
  requireLiveness = true,
  buttonLabel = 'Start Secure Scan',
  disabled = false,
  autoCapture = true,
  showOverlayStatus = true,
}) {
  const videoRef = useRef(null)
  const analysisCanvasRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const analyzingRef = useRef(false)
  const readyStreakRef = useRef(0)
  const cooldownUntilRef = useRef(0)
  const autoArmedRef = useRef(true)
  const intervalRef = useRef(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [supportsFaceDetector, setSupportsFaceDetector] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [analysis, setAnalysis] = useState({
    ready: false,
    message: 'Initializing camera...',
    detail: 'Allow webcam access to continue.',
    brightness: 0,
    faceFound: false,
    faceSize: 0,
  })
  const [challenge, setChallenge] = useState(CHALLENGES[0])

  const busy = scanning || capturing
  const resultCard = useMemo(() => formatResult(result, mode), [result, mode])

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function setupCamera() {
      setCameraError('')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setCameraReady(true)
      } catch (err) {
        setCameraError('Camera access failed. Please allow webcam permission and refresh the page.')
        setCameraReady(false)
      }
    }

    if ('FaceDetector' in window) {
      try {
        detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
        setSupportsFaceDetector(true)
      } catch (err) {
        detectorRef.current = null
        setSupportsFaceDetector(false)
      }
    }

    setupCamera()

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      stopStream()
    }
  }, [stopStream])

  const snapshotFrame = useCallback((quality = 0.88) => {
    const video = videoRef.current
    const canvas = captureCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return ''

    const width = CAPTURE_WIDTH
    const height = Math.round((video.videoHeight / video.videoWidth) * width)
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  }, [])

  const buildCapturePayload = useCallback(async () => {
    const previewSrc = snapshotFrame(0.9)
    if (!previewSrc) {
      throw new Error('Unable to capture image from camera.')
    }

    const payload = {
      image_base64: stripDataPrefix(previewSrc),
      preview_src: previewSrc,
    }

    if (requireLiveness) {
      const frames = []
      for (let index = 0; index < LIVENESS_FRAME_COUNT; index += 1) {
        frames.push(stripDataPrefix(snapshotFrame(0.72)))
        if (index < LIVENESS_FRAME_COUNT - 1) {
          await sleep(LIVENESS_FRAME_DELAY)
        }
      }
      payload.liveness_frames = frames
    }

    return payload
  }, [requireLiveness, snapshotFrame])

  const handleCapture = useCallback(async () => {
    if (busy || disabled || !cameraReady) return
    autoArmedRef.current = false
    cooldownUntilRef.current = Date.now() + 3500
    setCapturing(true)
    setChallenge(CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)])
    try {
      const payload = await buildCapturePayload()
      await Promise.resolve(onCapture?.(payload))
    } finally {
      setCapturing(false)
    }
  }, [buildCapturePayload, busy, cameraReady, disabled, onCapture])

  const analyzeFrame = useCallback(async () => {
    if (analyzingRef.current || !cameraReady || busy || disabled) return

    const video = videoRef.current
    const canvas = analysisCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return

    analyzingRef.current = true
    try {
      canvas.width = ANALYSIS_WIDTH
      canvas.height = ANALYSIS_HEIGHT
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)

      const frame = ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT)
      let luminanceTotal = 0
      for (let i = 0; i < frame.data.length; i += 16) {
        const r = frame.data[i]
        const g = frame.data[i + 1]
        const b = frame.data[i + 2]
        luminanceTotal += 0.299 * r + 0.587 * g + 0.114 * b
      }
      const brightness = luminanceTotal / (frame.data.length / 16)

      let face = null
      if (detectorRef.current) {
        const faces = await detectorRef.current.detect(canvas)
        if (faces?.length) {
          face = faces
            .slice()
            .sort((a, b) => (b.boundingBox.width * b.boundingBox.height) - (a.boundingBox.width * a.boundingBox.height))[0]
        }
      }

      let nextState
      if (brightness < LIGHT_THRESHOLD) {
        nextState = {
          ready: false,
          message: 'Too dark',
          detail: 'Move to a brighter place or face the light source.',
          brightness,
          faceFound: Boolean(face),
          faceSize: face ? face.boundingBox.width / ANALYSIS_WIDTH : 0,
        }
      } else if (!face) {
        nextState = {
          ready: false,
          message: supportsFaceDetector ? 'Align your face inside the guide frame' : 'Camera ready',
          detail: supportsFaceDetector
            ? 'Keep your eyes, nose, and mouth inside the scan frame.'
            : 'Face detector is not available in this browser. Use the button if auto-capture does not start.',
          brightness,
          faceFound: false,
          faceSize: 0,
        }
      } else {
        const { x, y, width, height } = face.boundingBox
        const centerX = x + (width / 2)
        const centerY = y + (height / 2)
        const offsetX = Math.abs(centerX - (ANALYSIS_WIDTH / 2)) / ANALYSIS_WIDTH
        const offsetY = Math.abs(centerY - (ANALYSIS_HEIGHT / 2)) / ANALYSIS_HEIGHT
        const sizeRatio = Math.max(width / ANALYSIS_WIDTH, height / ANALYSIS_HEIGHT)

        if (sizeRatio < FACE_SIZE_THRESHOLD) {
          nextState = {
            ready: false,
            message: 'Move closer',
            detail: 'Bring your face slightly closer to the camera for a sharper scan.',
            brightness,
            faceFound: true,
            faceSize: sizeRatio,
          }
        } else if (offsetX > CENTER_THRESHOLD || offsetY > CENTER_THRESHOLD) {
          nextState = {
            ready: false,
            message: 'Face not centered',
            detail: 'Place your face inside the middle guide frame.',
            brightness,
            faceFound: true,
            faceSize: sizeRatio,
          }
        } else {
          nextState = {
            ready: true,
            message: autoCapture ? 'Face locked. Hold still for auto-capture.' : 'Face aligned. Ready to capture.',
            detail: requireLiveness
              ? 'When scanning starts, blink once or move your head slightly.'
              : 'Your face is aligned and ready.',
            brightness,
            faceFound: true,
            faceSize: sizeRatio,
          }
        }
      }

      if (nextState.ready) {
        readyStreakRef.current += 1
      } else {
        readyStreakRef.current = 0
        autoArmedRef.current = true
      }

      setAnalysis(nextState)

      if (
        autoCapture &&
        nextState.ready &&
        !busy &&
        !disabled &&
        autoArmedRef.current &&
        Date.now() > cooldownUntilRef.current &&
        readyStreakRef.current >= AUTO_CAPTURE_STREAK
      ) {
        cooldownUntilRef.current = Date.now() + 3500
        readyStreakRef.current = 0
        autoArmedRef.current = false
        await handleCapture()
      }
    } catch (err) {
      setAnalysis((prev) => ({
        ...prev,
        ready: false,
        message: 'Camera analysis paused',
        detail: 'Continue with manual capture if needed.',
      }))
    } finally {
      analyzingRef.current = false
    }
  }, [autoCapture, busy, cameraReady, disabled, handleCapture, requireLiveness, supportsFaceDetector])

  useEffect(() => {
    if (!cameraReady) return undefined
    intervalRef.current = setInterval(() => {
      analyzeFrame()
    }, 260)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [analyzeFrame, cameraReady])

  const qualityMeter = useMemo(() => {
    const lightScore = clamp((analysis.brightness / 120) * 100, 0, 100)
    const faceScore = analysis.faceFound ? clamp((analysis.faceSize / 0.36) * 100, 20, 100) : 0
    return Math.round((lightScore * 0.45) + (faceScore * 0.55))
  }, [analysis.brightness, analysis.faceFound, analysis.faceSize])

  return (
    <div className="w-full space-y-4">
      <div className="relative overflow-hidden rounded-[28px] border border-cyan-300/15 bg-[#08101f] shadow-[0_24px_80px_rgba(29,78,216,0.18)]">
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-cyan-400/12 to-transparent pointer-events-none" />

        <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />

          <canvas ref={analysisCanvasRef} className="hidden" />
          <canvas ref={captureCanvasRef} className="hidden" />

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_36%,rgba(2,6,23,0.58)_75%)]" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-[72%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-[38%] border-[3px] border-cyan-300/75 shadow-[0_0_32px_rgba(34,211,238,0.32)]" />
            <div className="absolute left-1/2 top-1/2 h-[78%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[40px] border border-cyan-300/15" />
            <div className="absolute left-[18%] top-[16%] h-10 w-10 rounded-tl-3xl border-l-[3px] border-t-[3px] border-cyan-300/85" />
            <div className="absolute right-[18%] top-[16%] h-10 w-10 rounded-tr-3xl border-r-[3px] border-t-[3px] border-cyan-300/85" />
            <div className="absolute bottom-[16%] left-[18%] h-10 w-10 rounded-bl-3xl border-b-[3px] border-l-[3px] border-cyan-300/85" />
            <div className="absolute bottom-[16%] right-[18%] h-10 w-10 rounded-br-3xl border-b-[3px] border-r-[3px] border-cyan-300/85" />
            <div className={`absolute left-1/2 top-[18%] h-[2px] w-[46%] -translate-x-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent ${busy ? 'scan-line opacity-100' : 'opacity-30'}`} />
          </div>

          {showOverlayStatus && (
            <div className="absolute inset-x-0 bottom-0 p-4">
              <div className="mx-auto max-w-xl rounded-[22px] border border-white/10 bg-slate-950/70 px-4 py-3 backdrop-blur-xl">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${
                    analysis.message === 'Too dark'
                      ? 'bg-amber-400/10 text-amber-300'
                      : analysis.ready
                        ? 'bg-cyan-300/10 text-cyan-200'
                        : 'bg-white/5 text-slate-300'
                  }`}>
                    {analysis.message === 'Too dark' ? <SunMedium size={18} /> : <ScanFace size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{analysis.message}</p>
                    <p className="mt-1 text-xs text-slate-300">{busy ? `Scanning... ${challenge}` : analysis.detail}</p>
                  </div>
                  <div className={`hidden rounded-full px-3 py-1 text-[11px] font-semibold sm:block ${
                    analysis.ready
                      ? 'bg-cyan-300/10 text-cyan-200'
                      : 'bg-white/5 text-slate-400'
                  }`}>
                    {analysis.ready ? 'Auto-ready' : 'Adjust face'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 backdrop-blur-[2px]">
              <div className="rounded-[28px] border border-cyan-300/20 bg-slate-950/75 px-6 py-5 text-center shadow-2xl shadow-cyan-500/10">
                <Loader2 size={28} className="mx-auto animate-spin text-cyan-200" />
                <p className="mt-3 text-sm font-semibold text-white">Scanning...</p>
                <p className="mt-1 text-xs text-slate-300">
                  {requireLiveness ? challenge : 'Processing the face recognition result.'}
                </p>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 p-6">
              <div className="max-w-sm rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-center">
                <AlertTriangle size={28} className="mx-auto text-red-300" />
                <p className="mt-3 text-sm font-semibold text-white">Camera unavailable</p>
                <p className="mt-2 text-xs text-red-100">{cameraError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-white/5 bg-slate-950/60 p-4 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusChip
              icon={<Camera size={15} />}
              label="Device"
              value="Webcam only"
              tone="cyan"
            />
            <StatusChip
              icon={<SunMedium size={15} />}
              label="Lighting"
              value={analysis.brightness < LIGHT_THRESHOLD ? 'Too dark' : `Ready ${qualityMeter}%`}
              tone={analysis.brightness < LIGHT_THRESHOLD ? 'amber' : 'green'}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={handleCapture}
              disabled={busy || disabled || !cameraReady}
              className="btn-primary inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <ScanFace size={15} />}
              {busy ? 'Scanning...' : buttonLabel}
            </button>
            <p className="text-xs text-slate-400 sm:max-w-[220px] sm:text-right">
              {requireLiveness
                ? 'Blink once or move your head slightly when scanning starts.'
                : 'Auto-capture starts when the face is aligned clearly.'}
            </p>
          </div>
        </div>
      </div>

      {resultCard && (
        <div className={`rounded-3xl border px-4 py-4 ${resultToneClasses(resultCard.tone)}`}>
          <p className="text-sm font-semibold">{resultCard.title}</p>
          <p className="mt-1 text-xs opacity-90">{resultCard.message}</p>
        </div>
      )}
    </div>
  )
}

function StatusChip({ icon, label, value, tone = 'slate' }) {
  const tones = {
    cyan: 'border-cyan-300/20 bg-cyan-300/8 text-cyan-100',
    purple: 'border-violet-300/20 bg-violet-300/8 text-violet-100',
    amber: 'border-amber-300/20 bg-amber-300/8 text-amber-100',
    green: 'border-green-300/20 bg-green-300/8 text-green-100',
    slate: 'border-white/10 bg-white/[0.04] text-slate-200',
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone] || tones.slate}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] opacity-75">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  )
}
