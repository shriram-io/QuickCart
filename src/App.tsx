
import { useCallback, useEffect, useState } from 'react'
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
  Search,
  LogOut,
  LockKeyhole,
  Plus,
  Minus,
  Trash2,
  ScanLine,
  Package,
  RefreshCw,
} from 'lucide-react'

import BarcodeScannerWasm from './BarcodeScannerWasm'
import { supabase } from './lib/supabase'
import './App.css'

type StoreInfo = {
  id: string
  name: string
  city: string | null
  state: string | null
}

type StoreProduct = {
  id: string
  sku: string
  price: number
  currency_code: string
  is_available: boolean
}

type ProductInfo = {
  id: string
  name: string
  brand: string | null
  unit_label: string | null
  image_url: string | null
  storeProduct: StoreProduct
}

type CartItem = {
  id: string
  session_id: string
  store_product_id: string
  quantity: number
  unit_price_at_add: number
  currency_code: string
  store_products: {
    sku: string | null
    products: {
      name: string
      brand: string | null
      unit_label: string | null
      image_url: string | null
    }
  }
}

type ShoppingSession = {
  id: string
  store_id: string
  expires_at: string
  updated_at: string
}

type StoreMembership = {
  store_id: string
  role: 'owner' | 'manager' | 'staff'
}

type AppMode = 'workspace' | 'customer'

function formatPrice(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function App() {
  console.log('QUICKCART APP IS RUNNING')
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(null)
  const [showAllStores, setShowAllStores] = useState(false)

  const [userEmail, setUserEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [membership, setMembership] = useState<StoreMembership | null>(null)
  const [membershipLoading, setMembershipLoading] = useState(false)
  const [membershipError, setMembershipError] = useState('')
  const [appMode, setAppMode] = useState<AppMode>('customer')

  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [shoppingLoading, setShoppingLoading] = useState(false)

  const [storesLoaded, setStoresLoaded] = useState(false)
  const [sessionRestoreLoading, setSessionRestoreLoading] = useState(false)
  const [sessionRestoreChecked, setSessionRestoreChecked] = useState(false)

  const [error, setError] = useState('')
  const [shoppingSessionId, setShoppingSessionId] = useState('')

  const [scannedBarcode, setScannedBarcode] = useState('')
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [productNotFound, setProductNotFound] = useState(false)

  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [cartLoading, setCartLoading] = useState(false)
  const [cartActionLoading, setCartActionLoading] = useState(false)

  // Restore the Supabase authentication session.
  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (!mounted) return

      if (error) setError(error.message)

      setAuthUserId(data.session?.user.id ?? null)
      setIsAuthenticated(Boolean(data.session))
      setLoading(false)
    }

    void loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user.id ?? null)
      setIsAuthenticated(Boolean(session))
      if (!session) {
        setMembership(null)
        setMembershipError('')
        setAppMode('customer')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Load active stores from Supabase.
  useEffect(() => {
    let mounted = true

    const loadStores = async () => {
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id, name, city, state')
          .eq('is_active', true)
          .order('name')

        if (error) {
          throw new Error(error.message)
        }

        if (!mounted) return

        const availableStores = (data ?? []) as StoreInfo[]

        setStores(availableStores)

        if (availableStores.length > 0) {
          setSelectedStore(availableStores[0])
        }
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error
              ? `Could not load stores: ${loadError.message}`
              : 'Could not load stores.',
          )
        }
      } finally {
        if (mounted) setStoresLoaded(true)
      }
    }

    void loadStores()

    return () => {
      mounted = false
    }
  }, [])

  // Resolve the signed-in user's store role from database membership, never email.
  useEffect(() => {
    console.log('MEMBERSHIP EFFECT:', {
      isAuthenticated,
      authUserId,
      storesLoaded,
      storesCount: stores.length,
    })

    if (!isAuthenticated || !authUserId || !storesLoaded) {
      setMembership(null)
      setMembershipLoading(false)
      return
    }

    let cancelled = false

    const loadMembership = async () => {
      setMembershipLoading(true)
      setMembershipError('')

      try {
        const { data, error } = await supabase
          .from('store_members')
          .select('store_id, role')
          .eq('user_id', authUserId)

        console.log('MEMBERSHIP QUERY RESULT:', { data, error })
        if (error) throw new Error(error.message)
        if (cancelled) return

        const validMemberships = (data ?? []).filter(
          (item): item is StoreMembership =>
            item.role === 'owner' ||
            item.role === 'manager' ||
            item.role === 'staff',
        )

        const rolePriority: Record<StoreMembership['role'], number> = {
          owner: 0,
          manager: 1,
          staff: 2,
        }

        validMemberships.sort(
          (a, b) => rolePriority[a.role] - rolePriority[b.role],
        )

        const selectedMembership = validMemberships[0] ?? null
        setMembership(selectedMembership)

        if (selectedMembership) {
          const memberStore = stores.find(
            store => store.id === selectedMembership.store_id,
          )
          setSelectedStore(memberStore ?? null)
          setAppMode('workspace')
        } else {
          setAppMode('customer')
        }
      } catch (loadError) {
        if (!cancelled) {
          setMembership(null)
          setMembershipError(
            loadError instanceof Error
              ? `Could not verify store access: ${loadError.message}`
              : 'Could not verify store access.',
          )
        }
      } finally {
        if (!cancelled) setMembershipLoading(false)
      }
    }

    void loadMembership()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, authUserId, storesLoaded, stores])

  // Restore the customer's most recently updated active, unexpired session.
  useEffect(() => {
    if (!isAuthenticated) {
      setSessionRestoreChecked(false)
      setShoppingSessionId('')
      setCartItems([])
      return
    }

    if (!storesLoaded || sessionRestoreChecked) return

    let cancelled = false

    const restoreSession = async () => {
      setSessionRestoreLoading(true)
      setError('')

      try {
        const { data, error } = await supabase
          .from('shopping_sessions')
          .select('id, store_id, expires_at, updated_at')
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (error) {
          throw new Error(error.message)
        }

        if (cancelled) return

        if (data) {
          const session = data as ShoppingSession

          const matchingStore = stores.find(
            store => store.id === session.store_id,
          )

          if (!matchingStore) {
            setError(
              'Your previous shopping session belongs to a store that is currently unavailable.',
            )
            return
          }

          setSelectedStore(matchingStore)
          setShoppingSessionId(session.id)
          setScannedBarcode('')
          setProduct(null)
          setProductNotFound(false)
        }
      } catch (restoreError) {
        if (!cancelled) {
          setError(
            restoreError instanceof Error
              ? `Session restoration failed: ${restoreError.message}`
              : 'Could not restore your shopping session.',
          )
        }
      } finally {
        if (!cancelled) {
          setSessionRestoreLoading(false)
          setSessionRestoreChecked(true)
        }
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [
    isAuthenticated,
    storesLoaded,
    sessionRestoreChecked,
    stores,
  ])

  const handleLogin = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setError('')
    setAuthLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: userEmail.trim(),
        password,
      })

      if (error) setError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    setError('')

    const { error } = await supabase.auth.signOut()

    if (error) {
      setError(error.message)
      return
    }

    setShoppingSessionId('')
    setMembership(null)
    setMembershipError('')
    setAppMode('customer')
    setScannedBarcode('')
    setProduct(null)
    setProductNotFound(false)
    setCartItems([])
    setSessionRestoreChecked(false)
  }

  const handleStartShopping = async () => {
    if (!selectedStore) {
      setError('Please select a supermarket first.')
      return
    }

    setError('')
    setShoppingLoading(true)

    try {
      const { data, error } = await supabase.rpc(
        'start_shopping_session',
        {
          p_store_id: selectedStore.id,
        },
      )

      if (error) {
        throw new Error(error.message)
      }

      if (!data) {
        throw new Error('The database did not return a shopping session ID.')
      }

      setShoppingSessionId(data as string)
      setScannedBarcode('')
      setProduct(null)
      setProductNotFound(false)
    } catch (startError) {
      setError(
        startError instanceof Error
          ? `Could not start shopping: ${startError.message}`
          : 'Could not start shopping.',
      )
    } finally {
      setShoppingLoading(false)
    }
  }

  // Load the current session's cart.
  const loadCart = useCallback(async (sessionId: string) => {
    setCartLoading(true)

    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select(`
          id,
          session_id,
          store_product_id,
          quantity,
          unit_price_at_add,
          currency_code,
          store_products!inner (
            sku,
            products!inner (
              name,
              brand,
              unit_label,
              image_url
            )
          )
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) {
        throw new Error(error.message)
      }

      setCartItems((data ?? []) as unknown as CartItem[])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? `Could not load cart: ${loadError.message}`
          : 'Could not load cart.',
      )
    } finally {
      setCartLoading(false)
    }
  }, [])

  // Automatically load cart whenever a session is restored or started.
  useEffect(() => {
    if (shoppingSessionId) {
      void loadCart(shoppingSessionId)
    } else {
      setCartItems([])
    }
  }, [shoppingSessionId, loadCart])

  // Look up a barcode against the selected store's catalogue.
  const handleScan = useCallback(
    async (barcode: string) => {
      if (!selectedStore) {
        setError('No store is selected.')
        return
      }

      setScannedBarcode(barcode)
      setProduct(null)
      setProductNotFound(false)
      setLookupLoading(true)
      setError('')

      try {
        const { data, error } = await supabase
          .from('product_barcodes')
          .select(`
            barcode,
            products!inner (
              id,
              name,
              brand,
              unit_label,
              image_url,
              is_active,
              store_products!inner (
                id,
                sku,
                price,
                currency_code,
                is_available,
                store_id
              )
            )
          `)
          .eq('barcode', barcode)
          .eq('products.is_active', true)
          .eq('products.store_products.store_id', selectedStore.id)
          .eq('products.store_products.is_available', true)
          .maybeSingle()

        if (error) throw new Error(error.message)

        if (!data || !data.products) {
          setProductNotFound(true)
          return
        }

        const productData = data.products as unknown as {
          id: string
          name: string
          brand: string | null
          unit_label: string | null
          image_url: string | null
          store_products: StoreProduct[]
        }

        const storeProduct = productData.store_products?.[0]

        if (!storeProduct) {
          setProductNotFound(true)
          return
        }

        setProduct({
          id: productData.id,
          name: productData.name,
          brand: productData.brand,
          unit_label: productData.unit_label,
          image_url: productData.image_url,
          storeProduct,
        })
      } catch (lookupError) {
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : 'Product lookup failed.',
        )
      } finally {
        setLookupLoading(false)
      }
    },
    [selectedStore],
  )

  // Add product through the database RPC.
  const handleAddToCart = async () => {
    if (!product || !shoppingSessionId) return

    setError('')
    setCartActionLoading(true)

    try {
      const { error } = await supabase.rpc('add_cart_item', {
        p_session_id: shoppingSessionId,
        p_store_product_id: product.storeProduct.id,
        p_quantity: 1,
      })

      if (error) throw new Error(error.message)

      await loadCart(shoppingSessionId)

      setProduct(null)
      setScannedBarcode('')
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Could not add product to cart.',
      )
    } finally {
      setCartActionLoading(false)
    }
  }

  // Update quantity through the database RPC.
  const handleQuantityChange = async (
    cartItemId: string,
    quantity: number,
  ) => {
    if (!shoppingSessionId || quantity < 1 || quantity > 99) return

    setError('')
    setCartActionLoading(true)

    try {
      const { error } = await supabase.rpc('set_cart_item_quantity', {
        p_cart_item_id: cartItemId,
        p_quantity: quantity,
      })

      if (error) throw new Error(error.message)

      await loadCart(shoppingSessionId)
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Could not update quantity.',
      )
    } finally {
      setCartActionLoading(false)
    }
  }

  const handleRemoveFromCart = async (cartItemId: string) => {
    if (!shoppingSessionId) return

    setError('')
    setCartActionLoading(true)

    try {
      const { error } = await supabase.rpc('remove_cart_item', {
        p_cart_item_id: cartItemId,
      })

      if (error) throw new Error(error.message)

      await loadCart(shoppingSessionId)
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Could not remove product.',
      )
    } finally {
      setCartActionLoading(false)
    }
  }

  const cartTotal = cartItems.reduce(
    (total, item) =>
      total + Number(item.unit_price_at_add) * item.quantity,
    0,
  )

  const cartQuantity = cartItems.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  if (
    loading ||
    (isAuthenticated && (!authUserId || !storesLoaded || membershipLoading || sessionRestoreLoading))
  ) {
    return (
      <main className="app-shell auth-loading">
        <ShoppingCart size={32} />
        <p>
          {loading
            ? 'Loading QuickCart...'
            : membershipLoading
              ? 'Checking your store access...'
              : 'Restoring your shopping session...'}
        </p>
      </main>
    )
  }

  // Customer authentication screen.
  if (!isAuthenticated) {
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

        <section className="auth-card">
          <div className="auth-icon">
            <LockKeyhole size={27} />
          </div>

          <h1>Welcome back</h1>
          <p>Sign in to start your supermarket shopping session.</p>

          <form onSubmit={handleLogin}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={userEmail}
              onChange={event => setUserEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              required
            />

            {error && <p className="app-error">{error}</p>}

            <button
              className="primary-button"
              type="submit"
              disabled={authLoading}
            >
              {authLoading ? 'Signing in...' : 'Sign in'}
              <ChevronRight size={18} />
            </button>
          </form>

          <p className="auth-note">
            Secure customer authentication powered by Supabase.
          </p>
        </section>

        <footer className="app-footer">
          <ShieldCheck size={14} />
          <span>QuickCart · Secure shopping experience</span>
        </footer>
      </main>
    )
  }

  // Fail closed if membership lookup failed: do not silently guess the user's role.
  if (isAuthenticated && membershipError) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon"><ShoppingCart size={22} /></span>
            <div><strong>QuickCart</strong><small>ACCESS CHECK</small></div>
          </div>
          <button className="icon-button" aria-label="Sign out" onClick={handleLogout}>
            <LogOut size={19} />
          </button>
        </header>
        <section className="auth-card">
          <ShieldCheck size={30} />
          <h1>We couldn't verify your access</h1>
          <p>{membershipError}</p>
          <p>Please retry after checking your connection. QuickCart won't assume a role when the membership check fails.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Retry access check</button>
        </section>
      </main>
    )
  }

  // Store workspace for owners, managers and staff. Customer shopping remains a separate mode.
  if (membership && appMode === 'workspace') {
    const roleTitle =
      membership.role === 'owner'
        ? 'Owner workspace'
        : membership.role === 'manager'
          ? 'Manager workspace'
          : 'Staff workspace'

    const roleDescription =
      membership.role === 'owner'
        ? 'Manage your supermarket and oversee store operations.'
        : membership.role === 'manager'
          ? 'Coordinate store operations and support your team.'
          : 'Access the store tools assigned to your staff role.'

    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon"><Store size={22} /></span>
            <div><strong>QuickCart</strong><small>STORE WORKSPACE</small></div>
          </div>
          <button className="icon-button" aria-label="Sign out" onClick={handleLogout}>
            <LogOut size={19} />
          </button>
        </header>

        <section className="intro">
          <span className="location-badge"><ShieldCheck size={14} /> VERIFIED STORE ACCESS</span>
          <h1>{roleTitle}</h1>
          <p>{roleDescription}</p>
        </section>

        <section className="featured-store">
          <div className="location-row">
            <span className="location-badge"><Store size={13} /> YOUR STORE</span>
            <span className="gps-status"><span className="status-dot" /> Membership active</span>
          </div>
          <h2>{selectedStore?.name ?? 'Assigned store unavailable'}</h2>
          <div className="store-meta">
            <span><MapPin size={15} /> {[selectedStore?.city, selectedStore?.state].filter(Boolean).join(', ') || 'Location not provided'}</span>
            <span><Users size={15} /> Role: {membership.role}</span>
          </div>
          {!selectedStore && (
            <p className="app-error">Your membership exists, but its store is not available in the active store list. Contact the platform administrator.</p>
          )}
        </section>

        <section className="entry-card">
          <div className="section-heading">
            <Store size={20} />
            <div><h2>Store operations</h2><p>Your access is determined by your database membership.</p></div>
          </div>
          <div className="store-stats">
            <div className="stat-card"><Package size={19} /><div><small>Products & inventory</small><strong>Management module next</strong></div></div>
            <div className="stat-card"><ShoppingCart size={19} /><div><small>Orders & checkout</small><strong>Management module next</strong></div></div>
            <div className="stat-card"><Users size={19} /><div><small>Team & permissions</small><strong>{membership.role === 'owner' || membership.role === 'manager' ? 'Role permits team administration' : 'Staff access'}</strong></div></div>
          </div>
          <p className="cart-disclaimer">This is the role-aware workspace foundation. The operational modules are not active yet; we will implement them against the database permissions before exposing management actions.</p>
          <button className="primary-button" type="button" onClick={() => setAppMode('customer')} disabled={!selectedStore}>
            <ShoppingCart size={18} /> Switch to customer shopping <ChevronRight size={18} />
          </button>
        </section>

        <footer className="app-footer"><ShieldCheck size={14} /><span>QuickCart · Store access verified from membership</span></footer>
      </main>
    )
  }

  // Active shopping session.
  if (shoppingSessionId) {
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

          {membership && (
            <button className="secondary-button" type="button" onClick={() => setAppMode('workspace')}>
              <Store size={16} /> Workspace
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={handleLogout}
          >
            <LogOut size={19} />
          </button>
        </header>

        <section className="shopping-workspace">
          <div className="shopping-store-heading">
            <div>
              <span className="location-badge">
                <MapPin size={13} />
                SHOPPING AT
              </span>
              <h1>{selectedStore?.name ?? 'Your supermarket'}</h1>
            </div>

            <span className="cart-count">
              <ShoppingCart size={16} />
              {cartQuantity} items
            </span>
          </div>

          {error && <p className="app-error">{error}</p>}

          {scannedBarcode ? (
            <section className="product-result-card">
              <div className="product-result-heading">
                <div>
                  <span className="location-badge">
                    <ScanLine size={14} />
                    BARCODE DETECTED
                  </span>
                  <h2>Product lookup</h2>
                </div>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setScannedBarcode('')
                    setProduct(null)
                    setProductNotFound(false)
                    setError('')
                  }}
                >
                  <RefreshCw size={16} />
                  Scan again
                </button>
              </div>

              <p className="barcode-value">{scannedBarcode}</p>

              {lookupLoading && (
                <div className="lookup-loading">
                  <RefreshCw size={22} />
                  <p>Finding product and store price...</p>
                </div>
              )}

              {productNotFound && !lookupLoading && (
                <div className="product-not-found">
                  <Package size={32} />
                  <h3>Product not found</h3>
                  <p>
                    This barcode is not registered as an available product
                    at this supermarket.
                  </p>
                </div>
              )}

              {product && !lookupLoading && (
                <div className="product-details">
                  {product.image_url ? (
                    <img
                      className="product-image"
                      src={product.image_url}
                      alt={product.name}
                    />
                  ) : (
                    <div className="product-image product-image-placeholder">
                      <Package size={38} />
                    </div>
                  )}

                  <div className="product-information">
                    <span className="product-available">
                      <span className="status-dot" />
                      Available
                    </span>

                    <h3>{product.name}</h3>

                    {product.brand && <p>{product.brand}</p>}

                    {product.unit_label && <p>{product.unit_label}</p>}

                    <p className="product-sku">
                      SKU: {product.storeProduct.sku}
                    </p>

                    <strong className="product-price">
                      {formatPrice(
                        product.storeProduct.price,
                        product.storeProduct.currency_code,
                      )}
                    </strong>
                  </div>

                  <button
                    className="primary-button add-product-button"
                    type="button"
                    disabled={cartActionLoading}
                    onClick={handleAddToCart}
                  >
                    <Plus size={19} />
                    {cartActionLoading ? 'Adding...' : 'Add to Cart'}
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section className="scanner-section">
              <div className="scanner-section-heading">
                <div>
                  <h2>Scan a product</h2>
                  <p>Point your camera at a product barcode.</p>
                </div>
              </div>

              <BarcodeScannerWasm
                onScan={handleScan}
                onClose={() => setShoppingSessionId('')}
              />
            </section>
          )}

          <section className="cart-section">
            <div className="cart-heading">
              <div>
                <h2>
                  <ShoppingCart size={20} />
                  Your Cart
                </h2>
                <p>
                  {cartQuantity} item{cartQuantity === 1 ? '' : 's'} added
                </p>
              </div>

              <button
                className="secondary-button"
                type="button"
                disabled={cartLoading}
                onClick={() => void loadCart(shoppingSessionId)}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            </div>

            {cartLoading ? (
              <p className="cart-empty">Loading cart...</p>
            ) : cartItems.length === 0 ? (
              <div className="cart-empty">
                <ShoppingCart size={32} />
                <h3>Your cart is empty</h3>
                <p>Scan a product to begin adding items.</p>
              </div>
            ) : (
              <div className="cart-list">
                {cartItems.map(item => (
                  <article className="cart-item" key={item.id}>
                    <div className="cart-item-information">
                      <strong>{item.store_products.products.name}</strong>

                      <small>
                        {item.store_products.products.unit_label ?? ''}
                      </small>

                      <small>
                        {formatPrice(
                          Number(item.unit_price_at_add),
                          item.currency_code,
                        )} each
                      </small>
                    </div>

                    <div className="cart-item-actions">
                      <button
                        className="quantity-button"
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={cartActionLoading}
                        onClick={() => {
                          if (item.quantity === 1) {
                            void handleRemoveFromCart(item.id)
                          } else {
                            void handleQuantityChange(
                              item.id,
                              item.quantity - 1,
                            )
                          }
                        }}
                      >
                        <Minus size={15} />
                      </button>

                      <strong>{item.quantity}</strong>

                      <button
                        className="quantity-button"
                        type="button"
                        aria-label="Increase quantity"
                        disabled={cartActionLoading || item.quantity >= 99}
                        onClick={() =>
                          void handleQuantityChange(
                            item.id,
                            item.quantity + 1,
                          )
                        }
                      >
                        <Plus size={15} />
                      </button>

                      <button
                        className="remove-cart-button"
                        type="button"
                        aria-label="Remove product"
                        disabled={cartActionLoading}
                        onClick={() => void handleRemoveFromCart(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <strong className="cart-item-total">
                      {formatPrice(
                        Number(item.unit_price_at_add) * item.quantity,
                        item.currency_code,
                      )}
                    </strong>
                  </article>
                ))}
              </div>
            )}

            <div className="cart-total-row">
              <span>Subtotal</span>
              <strong>
                {formatPrice(
                  cartTotal,
                  cartItems[0]?.currency_code ?? 'INR',
                )}
              </strong>
            </div>

            <p className="cart-disclaimer">
              Final payable amount is calculated and validated by the
              server during checkout. Taxes and applicable discounts are
              not included in this subtotal.
            </p>
          </section>
        </section>

        <footer className="app-footer">
          <ShieldCheck size={14} />
          <span>QuickCart · Secure shopping experience</span>
        </footer>
      </main>
    )
  }

  // Store selection screen.
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

        {membership && (
          <button className="secondary-button" type="button" onClick={() => setAppMode('workspace')}>
            <Store size={16} /> Workspace
          </button>
        )}
        <button
          className="icon-button"
          aria-label="Sign out"
          onClick={handleLogout}
        >
          <LogOut size={19} />
        </button>
      </header>

      <section className="intro">
        <h1>Scan, Bag & Skip the Queue</h1>
        <p>Shop in-store with a faster, simpler checkout experience.</p>
      </section>

      {error && <p className="app-error">{error}</p>}

      {selectedStore ? (
        <section className="featured-store">
          <div className="location-row">
            <span className="location-badge">
              <MapPin size={13} />
              STORE SELECTED
            </span>
            <span className="gps-status">
              <span className="status-dot" />
              Store available
            </span>
          </div>

          <h2>{selectedStore.name}</h2>

          <div className="store-meta">
            <span>
              <Clock size={15} />
              Store information
            </span>
            <span>
              <Wifi size={15} />
              Self-scan available
            </span>
          </div>

          <div className="store-stats">
            <div className="stat-card">
              <Store size={19} />
              <div>
                <small>Location</small>
                <strong>
                  {[selectedStore.city, selectedStore.state]
                    .filter(Boolean)
                    .join(', ') || 'Location not provided'}
                </strong>
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
            onClick={handleStartShopping}
            disabled={shoppingLoading || sessionRestoreLoading}
          >
            <QrCode size={18} />
            {shoppingLoading
              ? 'Starting...'
              : 'Start Shopping'}
            <ChevronRight size={19} />
          </button>
        </section>
      ) : (
        <section className="empty-stores">
          <Store size={30} />
          <h2>No active supermarkets found</h2>
          <p>There are currently no stores available for shopping.</p>
        </section>
      )}

      <section className="entry-card">
        <div className="section-heading">
          <QrCode size={20} />
          <div>
            <h2>Store Entry</h2>
            <p>Entry options depend on the selected supermarket.</p>
          </div>
        </div>

        <div className="entry-options">
          <button className="secondary-button" disabled>
            <QrCode size={17} />
            Scan Store QR
          </button>
          <button className="secondary-button" disabled>
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
          <h2>Available Supermarkets</h2>
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

        {stores
          .filter(store => store.id !== selectedStore?.id)
          .slice(0, showAllStores ? undefined : 3)
          .map(store => (
            <article className="nearby-store" key={store.id}>
              <div className="nearby-store-info">
                <h3>{store.name}</h3>
                <p>
                  {[store.city, store.state].filter(Boolean).join(', ')}
                </p>
                <div className="feature-tags">
                  <span>Self-scan available</span>
                </div>
              </div>

              <button
                className="select-button"
                onClick={() => setSelectedStore(store)}
              >
                Select
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
