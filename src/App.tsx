import { useCallback, useState } from 'react'
import {
  ShoppingCart,
  MapPin,
  Clock,
  Wifi,
  Store,
  Users,
  QrCode,
  Camera,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  HelpCircle,
  Search,
} from 'lucide-react'
import BarcodeScannerWasm from './BarcodeScannerWasm'
import './App.css'

type StoreInfo = {
  id: number
  name: string
  distance: string
  checkout: string
  features: string[]
}

const stores: StoreInfo[] = [
  {
    id: 1,
    name: 'FreshWay Market – Midtown Branch',
    distance: '0.1 mi',
    checkout: 'Express Self-Scan',
    features: ['Express checkout', 'Bakery · Deli · Hot Bar'],
  },
  {
    id: 2,
    name: 'FreshWay Downtown',
    distance: '0.8 mi',
    checkout: 'Full Self-Scan',
    features: ['Express checkout', 'Bakery · Deli · Hot Bar'],
  },
  {
    id: 3,
    name: 'GreenGrocer Organics – West',
    distance: '2.3 mi',
    checkout: 'Mobile Pay & Weigh Station',
    features: ['Digital scales', 'Bulk produce'],
  },
  {
    id: 4,
    name: 'SuperSave Mart – North Plaza',
    distance: '3.5 mi',
    checkout: 'Standard Self-Checkout',
    features: ['Self-checkout available'],
  },
]

function App() {
  const [selectedStore, setSelectedStore] = useState(stores[0])
  const [showAllStores, setShowAllStores] = useState(false)
  const [shoppingStarted, setShoppingStarted] = useState(false)
  const [scannedBarcode, setScannedBarcode] = useState('')

  const handleScan = useCallback((barcode: string) => {
    setScannedBarcode(barcode)
  }, [])

  if (shoppingStarted) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon">
              <ShoppingCart size={22} />
            </span>
            <div>
              <strong>QuickCart</strong>
              <small>EXPRESS SELF-SCAN</small>
            </div>
          </div>
        </header>

        {scannedBarcode ? (
          <section className="scanner-placeholder">
            <div className="scanner-icon">
              <QrCode size={30} />
            </div>

            <h1>Barcode scanned</h1>
            <p>Your scanned barcode is:</p>
            <strong className="scanned-barcode">{scannedBarcode}</strong>

            <p className="muted">
              Product lookup is not connected yet. We’ll add store-catalog
              matching next.
            </p>

            <button
              className="primary-button"
              onClick={() => setScannedBarcode('')}
            >
              Scan another product
            </button>

            <button
              className="secondary-button"
              onClick={() => setShoppingStarted(false)}
            >
              Back to store selection
            </button>
          </section>
        ) : (
          <BarcodeScannerWasm
  onScan={handleScan}
  onClose={() => setShoppingStarted(false)}
/>
        )}
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <ShoppingCart size={22} />
          </span>
          <div>
            <strong>QuickCart</strong>
            <small>EXPRESS SELF-SCAN</small>
          </div>
        </div>

        <button className="icon-button" aria-label="Help">
          <HelpCircle size={20} />
        </button>
      </header>

      <section className="intro">
        <h1>Scan, Bag & Skip the Queue</h1>
        <p>Shop in-store with a faster, simpler checkout experience.</p>
      </section>

      <section className="featured-store">
        <div className="location-row">
          <span className="location-badge">
            <MapPin size={13} />
            STORE SELECTED
          </span>
          <span className="gps-status">
            <span className="status-dot" />
            Location ready
          </span>
        </div>

        <h2>{selectedStore.name}</h2>

        <div className="store-meta">
          <span>
            <Clock size={15} />
            Open until 10:00 PM
          </span>
          <span>
            <Wifi size={15} />
            In-store Wi-Fi
          </span>
        </div>

        <div className="store-stats">
          <div className="stat-card">
            <Store size={19} />
            <div>
              <small>Checkout</small>
              <strong>{selectedStore.checkout}</strong>
            </div>
          </div>

          <div className="stat-card">
            <Users size={19} />
            <div>
              <small>Store status</small>
              <strong>Ready to shop</strong>
            </div>
          </div>
        </div>

        <button
          className="primary-button"
          onClick={() => {
            setScannedBarcode('')
            setShoppingStarted(true)
          }}
        >
          <QrCode size={18} />
          Start Shopping
          <ChevronRight size={19} />
        </button>
      </section>

      <section className="entry-card">
        <div className="section-heading">
          <QrCode size={20} />
          <div>
            <h2>Store Entry</h2>
            <p>Entry options depend on the selected supermarket.</p>
          </div>
        </div>

        <div className="entry-options">
          <button className="secondary-button">
            <QrCode size={17} />
            Scan Store QR
          </button>
          <button className="secondary-button">
            <Search size={17} />
            Enter Store Code
          </button>
        </div>

        <div className="camera-info">
          <span className="camera-icon">
            <Camera size={24} />
          </span>
          <strong>Store entry assistance</strong>
          <p>
            Follow the instructions displayed at your supermarket’s entrance.
          </p>
        </div>
      </section>

      <section className="nearby-section">
        <div className="section-title-row">
          <h2>Nearby & Recent Stores</h2>
          <button
            className="text-button"
            onClick={() => setShowAllStores(!showAllStores)}
          >
            {showAllStores ? 'Show less' : 'View all'}
            <ChevronDown
              size={15}
              className={showAllStores ? 'rotate-icon' : ''}
            />
          </button>
        </div>

        {(showAllStores ? stores : stores.slice(1, 3)).map((store) => (
          <article className="nearby-store" key={store.id}>
            <div className="nearby-store-info">
              <h3>{store.name}</h3>
              <p>
                {store.distance} · {store.checkout}
              </p>
              <div className="feature-tags">
                {store.features.map((feature) => (
                  <span key={feature}>{feature}</span>
                ))}
              </div>
            </div>

            <button
              className="select-button"
              onClick={() => setSelectedStore(store)}
            >
              {selectedStore.id === store.id ? 'Selected' : 'Select'}
            </button>
          </article>
        ))}
      </section>

      <footer className="app-footer">
        <ShieldCheck size={14} />
        <span>QuickCart · Store policies vary by location</span>
      </footer>
    </main>
  )
}

export default App