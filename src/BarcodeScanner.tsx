import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Camera, X, Keyboard, LoaderCircle } from 'lucide-react'

type BarcodeScannerProps = {
  onScan: (barcode: string) => void
  onClose: () => void
}

function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const hasScannedRef = useRef(false)

  const [error, setError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [isStarting, setIsStarting] = useState(true)

  useEffect(() => {
    let isMounted = true
    hasScannedRef.current = false

  

    async function startScanner() {
      try {
        const hints = new Map<DecodeHintType, BarcodeFormat[]>()

        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.ITF,
        ])

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 150,
        })

        const devices =
          await BrowserMultiFormatReader.listVideoInputDevices()

        if (!isMounted) return

        if (devices.length === 0) {
          setError('No camera was found on this device.')
          setIsStarting(false)
          return
        }

        const preferredCamera =
          devices.find((device) => /back|rear|environment/i.test(device.label)) ??
          devices[devices.length - 1]

        const controls = await reader.decodeFromVideoDevice(
          preferredCamera.deviceId,
          videoRef.current!,
          (result, decodeError) => {
  if (!isMounted || hasScannedRef.current) return

  if (result) {
    console.log('QUICKCART BARCODE DETECTED:', result.getText())

    hasScannedRef.current = true

    const barcode = result.getText()

    controlsRef.current?.stop()
    controlsRef.current = null

    onScan(barcode)
    return
  }

  if (decodeError && decodeError.name !== 'NotFoundException') {
    console.warn('QUICKCART DECODER ERROR:', decodeError)
  }
},
        )

        if (isMounted) {
          controlsRef.current = controls
          setIsStarting(false)
        } else {
          controls.stop()
        }
      } catch (err) {
        console.error('Barcode scanner startup error:', err)

        if (isMounted) {
          setError(
            'Camera access failed. Allow camera permission in your browser and try again.',
          )
          setIsStarting(false)
        }
      }
    }

    startScanner()

    return () => {
      isMounted = false
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [onScan])

  function submitManualCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const code = manualCode.trim()
    if (!code || hasScannedRef.current) return

    hasScannedRef.current = true
    controlsRef.current?.stop()
    controlsRef.current = null

    onScan(code)
  }

  return (
    <div className="scanner-overlay">
      <section className="scanner-modal" aria-label="Barcode scanner">
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
            <span />
            <span />
            <span />
            <span />
          </div>

          {isStarting && (
            <div className="scanner-status">
              <LoaderCircle className="spin" size={24} />
              <p>Starting camera…</p>
            </div>
          )}

          {error && (
            <div className="scanner-status scanner-error">
              <Camera size={28} />
              <p>{error}</p>
            </div>
          )}
        </div>

        <p className="scanner-instruction">
          Point your camera at the product’s barcode.
        </p>

        <div className="scanner-divider">
          <span>OR ENTER BARCODE</span>
        </div>

        <form className="manual-code-form" onSubmit={submitManualCode}>
          <label className="manual-code-label" htmlFor="manual-barcode">
            Barcode number
          </label>

          <div className="manual-code-row">
            <input
              id="manual-barcode"
              type="text"
              inputMode="numeric"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Enter barcode number"
            />

            <button type="submit" disabled={!manualCode.trim()}>
              <Keyboard size={18} />
              Search
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default BarcodeScanner