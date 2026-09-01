import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import QrScanner from 'qr-scanner'
import { Camera, CameraSlash, CircleNotch, Keyboard, UploadSimple } from '@phosphor-icons/react'
import { createScanGate } from '../lib/scanGate'
import { Button, Input, cx } from './ui'

export type ScanSource = 'camera' | 'upload' | 'manual'
type CameraState = 'idle' | 'starting' | 'running' | 'denied' | 'no-camera' | 'error'

const CAMERA_HELP: Partial<Record<CameraState, string>> = {
  denied: 'Camera access was blocked. Allow it from the address bar, or use a photo or the Book ID below.',
  'no-camera': "No camera found on this device. Upload a photo of the label or type the Book ID instead.",
  error: "The camera couldn't start. It may be in use by another app. The photo and Book ID options still work.",
}

interface Props {
  onCode: (code: string, source: ScanSource) => void
  busy?: boolean
  disabled?: boolean
  disabledReason?: string
}

export function QrScannerPanel({ onCode, busy = false, disabled = false, disabledReason }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const latest = useRef({ onCode, busy, disabled })
  const gate = useMemo(() => createScanGate(2500), [])
  const [camera, setCamera] = useState<CameraState>('idle')
  const [manual, setManual] = useState('')
  const [photoError, setPhotoError] = useState<string | null>(null)

  // the scanner callback is created once, so it reads the latest props through a ref
  useEffect(() => {
    latest.current = { onCode, busy, disabled }
  })

  async function startCamera() {
    const video = videoRef.current
    if (!video) return
    setCamera('starting')
    try {
      if (!(await QrScanner.hasCamera())) return setCamera('no-camera')
      scannerRef.current ??= new QrScanner(
        video,
        (result) => {
          const { busy: isBusy, disabled: isDisabled, onCode: emit } = latest.current
          if (!isBusy && !isDisabled && gate.accept(result.data)) emit(result.data, 'camera')
        },
        { returnDetailedScanResult: true, preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 6 },
      )
      await scannerRef.current.start()
      setCamera('running')
    } catch (err) {
      const reason = err instanceof Error ? `${err.name} ${err.message}` : String(err)
      setCamera(/NotAllowed|Permission|denied/i.test(reason) ? 'denied' : /not found|NotFound/i.test(reason) ? 'no-camera' : 'error')
    }
  }

  const stopCamera = () => {
    scannerRef.current?.stop()
    setCamera('idle')
  }

  useEffect(() => {
    if (disabled && scannerRef.current) {
      scannerRef.current.stop()
      setCamera('idle')
    }
  }, [disabled])

  useEffect(
    () => () => {
      scannerRef.current?.destroy()
      scannerRef.current = null
    },
    [],
  )

  async function scanPhoto(file: File | undefined) {
    if (!file) return
    setPhotoError(null)
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      onCode(result.data, 'upload')
    } catch {
      setPhotoError("Couldn't find a QR code in that photo. Try a closer, sharper shot.")
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault()
    if (!manual.trim()) return
    onCode(manual.trim(), 'manual')
    setManual('')
  }

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#1b1a17] text-[#eeebe4]">
        <video ref={videoRef} className={cx('h-full w-full object-cover', camera !== 'running' && 'invisible')} muted playsInline />

        {camera !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            {CAMERA_HELP[camera] ? (
              <>
                <CameraSlash size={28} aria-hidden />
                <p className="max-w-xs text-sm text-[#bab5aa]">{CAMERA_HELP[camera]}</p>
                {camera !== 'no-camera' && (
                  <Button size="sm" onClick={startCamera}>
                    Try again
                  </Button>
                )}
              </>
            ) : (
              <>
                <p className="font-display text-xl">Hold the book's label up to the camera</p>
                <Button variant="secondary" icon={camera === 'starting' ? <CircleNotch className="animate-spin" aria-hidden /> : <Camera aria-hidden />} onClick={startCamera} disabled={disabled || camera === 'starting'}>
                  {camera === 'starting' ? 'Starting camera' : 'Start camera'}
                </Button>
              </>
            )}
          </div>
        )}

        {camera === 'running' && (
          <button onClick={stopCamera} className="absolute top-3 right-3 rounded-md bg-[#1b1a17]/70 px-3 py-1.5 text-xs text-[#eeebe4] backdrop-blur hover:bg-[#1b1a17]">
            Stop camera
          </button>
        )}

        {busy && (
          <span className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#1b1a17]/80 px-3 py-1.5 text-xs backdrop-blur" role="status">
            <CircleNotch className="animate-spin" size={14} aria-hidden /> Checking the label…
          </span>
        )}

        {disabled && (
          <div className="absolute inset-0 grid place-items-center bg-[#1b1a17]/85 px-8 text-center">
            <p className="max-w-xs text-sm text-[#d6d2c8]">{disabledReason}</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className={cx('cursor-pointer', disabled && 'pointer-events-none opacity-50')}>
          <span className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            <UploadSimple aria-hidden /> Scan a photo
          </span>
          <input type="file" accept="image/*" className="sr-only" disabled={disabled} onChange={(e) => scanPhoto(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </label>
        <form onSubmit={submitManual} className="flex min-w-60 flex-1 gap-2">
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="…or type a Book ID / ISBN" aria-label="Book ID or ISBN" className="font-mono" disabled={disabled} />
          <Button type="submit" icon={<Keyboard aria-hidden />} disabled={disabled || !manual.trim() || busy}>
            Go
          </Button>
        </form>
      </div>
      {photoError && <p className="mt-2 text-[13px] text-stamp">{photoError}</p>}
    </div>
  )
}
