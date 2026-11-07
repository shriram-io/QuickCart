
import { useEffect, useRef, useState } from 'react'
import { readBarcodes } from 'zxing-wasm/reader'
import {
  Camera,
  X,
  Keyboard,
  ScanLine,
} from 'lucide-react'

type Props = {
  onScan: (barcode: string) => void
  onClose: () => void
}

function isValidEAN13(value: string) {
  if (!/^\d{13}$/.test(value)) return false

  const digits = value.split('').map(Number)
  const sum = digits
    .slice(0, 12)
    .reduce((total, digit, index) => {
      return total + digit * (index % 2 === 0 ? 1 : 3)
    }, 0)

  return (10 - (sum % 10)) % 10 === digits[12]
}

function BarcodeScannerWasm({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scannedRef = useRef(false)
  const busyRef = useRef(false)
  const activeRef = useRef(false)
  const onScanRef = useRef(onScan)

  const [status, setStatus] = useState('Starting camera...')
  const [error, setError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  const [diagnostics, setDiagnostics] = useState({
    resolution: 'Detecting...',
    attempts: 0,
    detections: 0,
    lastFormat: 'None',
    lastDecodeTime: 0,
    enhancedAttempts: 0,
  })

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let animationId = 0
    let frameCount = 0
    let lastScanTime = 0
    let stopped = false

    activeRef.current = true
    scannedRef.current = false
    busyRef.current = false

    const fullCanvas = document.createElement('canvas')
    const cropCanvas = document.createElement('canvas')
    const enhancedCanvas = document.createElement('canvas')

    const fullContext = fullCanvas.getContext('2d', {
  willReadFrequently: true,
})!

const cropContext = cropCanvas.getContext('2d', {
  willReadFrequently: true,
})!

const enhancedContext = enhancedCanvas.getContext('2d', {
  willReadFrequently: true,
})!

    async function stopCamera() {
      const stream = streamRef.current
      streamRef.current = null

      stream?.getTracks().forEach(track => track.stop())

      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.srcObject = null
      }
    }

    function prepareEnhancedImage(
      source: ImageData,
      target: HTMLCanvasElement,
      context: CanvasRenderingContext2D,
      contrast: number,
    ) {
      target.width = source.width
      target.height = source.height

      context.putImageData(source, 0, 0)

      const image = context.getImageData(
        0,
        0,
        target.width,
        target.height,
      )

      const pixels = image.data

      for (let i = 0; i < pixels.length; i += 4) {
        const gray =
          0.299 * pixels[i] +
          0.587 * pixels[i + 1] +
          0.114 * pixels[i + 2]

        const adjusted = Math.max(
          0,
          Math.min(255, (gray - 128) * contrast + 128),
        )

        pixels[i] = adjusted
        pixels[i + 1] = adjusted
        pixels[i + 2] = adjusted
      }

      context.putImageData(image, 0, 0)

      return context.getImageData(
        0,
        0,
        target.width,
        target.height,
      )
    }

    async function decodeImage(image: ImageData) {
  return readBarcodes(image, {
    formats: [
      'EAN13',
      'EAN8',
      'UPCA',
      'UPCE',
      'Code128',
      'ITF',
      'Codabar',
      'DataBar',
      'DataBarExpanded',
    ],
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    downscaleFactor: 2,
    downscaleThreshold: 500,
    maxNumberOfSymbols: 1,
    returnErrors: true,
  })
}

    async function startCamera() {
      try {
        if (
  !navigator.mediaDevices ||
  !navigator.mediaDevices.getUserMedia
) {
  throw new Error(
    `Camera API unavailable.
    Secure context: ${window.isSecureContext}
    Protocol: ${window.location.protocol}
    MediaDevices: ${!!navigator.mediaDevices}
    User Agent: ${navigator.userAgent}`
  )
}


        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 30 },
          },
        })

        if (!activeRef.current || stopped) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        streamRef.current = stream

        const video = videoRef.current

        if (!video) {
          throw new Error('Video element is unavailable.')
        }

        video.srcObject = stream
        await video.play()

        if (!activeRef.current || stopped) return

        const track = stream.getVideoTracks()[0]

        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean
        }

        setTorchAvailable(Boolean(capabilities.torch))

        // Request continuous autofocus when supported.
        try {
          await track.applyConstraints({
            advanced: [
              { focusMode: 'continuous' } as MediaTrackConstraintSet,
            ],
          })
        } catch {
          console.info('Continuous autofocus is not supported.')
        }

        setStatus('Camera ready. Looking for a barcode...')

        async function scanFrame(timestamp: number) {
          if (
            !activeRef.current ||
            stopped ||
            scannedRef.current
          ) {
            return
          }

          animationId = requestAnimationFrame(scanFrame)

          const currentVideo = videoRef.current

          if (
            busyRef.current ||
            timestamp - lastScanTime < 150 ||
            !currentVideo ||
            currentVideo.readyState <
              HTMLMediaElement.HAVE_CURRENT_DATA ||
            currentVideo.videoWidth === 0
          ) {
            return
          }

          lastScanTime = timestamp
          busyRef.current = true
          frameCount += 1

          try {
            const width = currentVideo.videoWidth
            const height = currentVideo.videoHeight

            fullCanvas.width = width
            fullCanvas.height = height

            fullContext.drawImage(
              currentVideo,
              0,
              0,
              width,
              height,
            )

            const originalImage = fullContext.getImageData(
              0,
              0,
              width,
              height,
            )

            const decodeStart = performance.now()

            // Pass 1: Decode the original camera frame.
            let results = await decodeImage(originalImage)

            let enhancedAttempted = false

            // Passes 2 and 3: Process the central region every
            // fourth unsuccessful frame to limit processing cost.
            if (
              results.length === 0 &&
              frameCount % 4 === 0 &&
              activeRef.current &&
              !scannedRef.current
            ) {
              enhancedAttempted = true

              const cropWidth = Math.floor(width * 0.85)
              const cropHeight = Math.floor(height * 0.60)

              const cropX = Math.floor((width - cropWidth) / 2)
              const cropY = Math.floor((height - cropHeight) / 2)

              const upscale = 1.5

              cropCanvas.width = Math.floor(cropWidth * upscale)
              cropCanvas.height = Math.floor(cropHeight * upscale)

              cropContext.imageSmoothingEnabled = true
              cropContext.imageSmoothingQuality = 'high'

              cropContext.drawImage(
                currentVideo,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                0,
                0,
                cropCanvas.width,
                cropCanvas.height,
              )

              const croppedImage = cropContext.getImageData(
                0,
                0,
                cropCanvas.width,
                cropCanvas.height,
              )

              // Pass 2: Enlarged crop.
              results = await decodeImage(croppedImage)

              // Pass 3: Grayscale and contrast-enhanced crop.
              if (
                results.length === 0 &&
                activeRef.current &&
                !scannedRef.current
              ) {
                const enhancedImage = prepareEnhancedImage(
                  croppedImage,
                  enhancedCanvas,
                  enhancedContext,
                  1.5,
                )

                results = await decodeImage(enhancedImage)
              }
            }

            const decodeTime = Math.round(
              performance.now() - decodeStart,
            )

            setDiagnostics(previous => ({
              ...previous,
              resolution: `${width} × ${height}`,
              attempts: previous.attempts + 1,
              detections:
                previous.detections + results.length,
              lastFormat:
                results[0]?.format ?? previous.lastFormat,
              lastDecodeTime: decodeTime,
              enhancedAttempts:
                previous.enhancedAttempts +
                (enhancedAttempted ? 1 : 0),
            }))

            if (
              activeRef.current &&
              !scannedRef.current &&
              results.length > 0
            ) {
              const validResult = results.find(result => {
                if (!result.text || result.isValid === false) {
                  return false
                }

                if (result.format === 'EAN13') {
                  return isValidEAN13(result.text)
                }

                return true
              })

              if (validResult) {
                scannedRef.current = true
                setStatus('Barcode detected!')

                await stopCamera()

                if (activeRef.current && !stopped) {
                  onScanRef.current(validResult.text)
                }
              }
            }
          } catch (scanError) {
            console.warn(
              'Barcode decoding attempt failed:',
              scanError,
            )
          } finally {
            busyRef.current = false
          }
        }

        animationId = requestAnimationFrame(scanFrame)
      } catch (cameraError) {
        console.error('Camera startup failed:', cameraError)

        if (activeRef.current && !stopped) {
          setError(
            cameraError instanceof Error
              ? cameraError.message
              : 'Unable to access the camera.',
          )

          setStatus('Camera unavailable')
        }
      }
    }

    startCamera()

    return () => {
      stopped = true
      activeRef.current = false

      cancelAnimationFrame(animationId)

      void stopCamera()
    }
  }, [])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]

    if (!track) return

    try {
      const nextState = !torchOn

      await track.applyConstraints({
        advanced: [
          { torch: nextState } as MediaTrackConstraintSet,
        ],
      })

      setTorchOn(nextState)
    } catch (torchError) {
      console.warn('Torch is unavailable:', torchError)
      setError('Flashlight is not supported by this camera.')
    }
  }

  function submitManualCode(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    const code = manualCode.trim()

    if (!code || scannedRef.current) return

    scannedRef.current = true

    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null

    onScanRef.current(code)
  }

  return (
    <div className="scanner-overlay">
      <section
        className="scanner-modal"
        aria-label="QuickCart barcode scanner"
      >
        <header className="scanner-header">
          <div>
            <p className="eyebrow">QUICKCART SCANNER</p>
            <h2>Scan a product</h2>
          </div>

          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
          >
            <X size={22} />
          </button>
        </header>

        <div className="scanner-video-container">
          <video
            ref={videoRef}
            className="scanner-video"
            muted
            playsInline
          />

          <div className="scanner-frame" aria-hidden="true">
            <ScanLine size={34} />
          </div>

          {error && (
            <div className="scanner-status scanner-error">
              <Camera size={26} />
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="scanner-instruction">
          {status}
        </div>

        {torchAvailable && (
          <button
            className="secondary-button"
            type="button"
            onClick={toggleTorch}
          >
            {torchOn
              ? 'Turn flashlight off'
              : 'Turn flashlight on'}
          </button>
        )}

        <details className="scanner-diagnostics">
          <summary>Scanner diagnostics</summary>

          <p>Camera: {diagnostics.resolution}</p>
          <p>Decode attempts: {diagnostics.attempts}</p>
          <p>Successful detections: {diagnostics.detections}</p>
          <p>Last barcode format: {diagnostics.lastFormat}</p>
          <p>Last decode time: {diagnostics.lastDecodeTime} ms</p>
          <p>Enhanced passes: {diagnostics.enhancedAttempts}</p>
        </details>

        <div className="scanner-divider">
          <span>OR ENTER BARCODE</span>
        </div>

        <form
          className="manual-code-form"
          onSubmit={submitManualCode}
        >
          <label
            className="manual-code-label"
            htmlFor="manual-barcode"
          >
            Barcode number
          </label>

          <div className="manual-code-row">
            <input
              id="manual-barcode"
              type="text"
              inputMode="numeric"
              value={manualCode}
              onChange={event =>
                setManualCode(event.target.value)
              }
              placeholder="Enter barcode number"
            />

            <button
              type="submit"
              disabled={!manualCode.trim()}
            >
              <Keyboard size={18} />
              Search
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default BarcodeScannerWasm
