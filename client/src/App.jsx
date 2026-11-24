import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, money } from "./api";
import catalog from "../../shared/catalog.json";

const CART_KEY = "greenbasket-cart";
const emptyAddress = { recipient: "", phone: "", line1: "", line2: "", city: "", postalCode: "" };
const previewCategories = catalog.categories.map((category, index) => ({
  ...category,
  _id: String(index + 101).padStart(24, "0"),
  slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}));
const previewProducts = catalog.products.map((product, index) => ({
  ...product,
  _id: String(index + 1).padStart(24, "0"),
  slug: product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
  brand: index % 3 === 0 ? "GreenBasket Organic" : "GreenBasket Select",
  category: previewCategories.find((category) => category.name === product.category),
  rating: 4.5 + (index % 5) / 10,
  reviewCount: 18 + index * 3,
  featured: index < 6,
  popularity: 100 - index * 3,
  isActive: true,
  _demo: true
}));

function findPreviewProducts(search, category, sort, onlyDeals, availableOnly, priceRange) {
  let matches = previewProducts.filter((product) => {
    const text = `${product.name} ${product.brand} ${product.category.name}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) &&
      (!category || product.category.slug === category) &&
      (!onlyDeals || product.price < product.originalPrice) &&
      (!availableOnly || product.quantity > 0) &&
      (!priceRange.min || product.price >= Number(priceRange.min)) &&
      (!priceRange.max || product.price <= Number(priceRange.max));
  });
  const sorters = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    popular: (a, b) => b.popularity - a.popularity,
    rating: (a, b) => b.rating - a.rating,
    newest: (a, b) => b.createdAt - a.createdAt
  };
  if (sorters[sort]) matches = [...matches].sort(sorters[sort]);
  return matches;
}

function Icon({ children, className = "" }) {
  return <span aria-hidden="true" className={`icon ${className}`}>{children}</span>;
}

function App() {
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get("reset") || "");
  const [routeCategory] = useState(() => decodeURIComponent(window.location.pathname.match(/^\/category\/([^/]+)$/)?.[1] || ""));
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(routeCategory);
  const [sort, setSort] = useState("");
  const [onlyDeals, setOnlyDeals] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [priceRange, setPriceRange] = useState({ min: "", max: "" });
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const productRequestId = useRef(0);
  const [notice, setNotice] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("gb-token") || "");
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("gb-user") || "null"));
  const [cart, setCart] = useState(() => JSON.parse(localStorage.getItem(CART_KEY) || "[]"));
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(Boolean(resetToken));
  const [authMode, setAuthMode] = useState(() => resetToken ? "reset" : "login");
  const [adminMode, setAdminMode] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [orders, setOrders] = useState([]);
  const [address, setAddress] = useState(emptyAddress);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [coupon, setCoupon] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [adminView, setAdminView] = useState(false);

  const tell = useCallback((message, kind = "success") => {
    setNotice({ message, kind });
    window.clearTimeout(tell.timer);
    tell.timer = window.setTimeout(() => setNotice(null), 3200);
  }, []);

  const loadProducts = useCallback(async () => {
    const requestId = ++productRequestId.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (activeCategory) params.set("category", activeCategory);
    if (sort) params.set("sort", sort);
    if (onlyDeals) params.set("discounted", "true");
    if (availableOnly) params.set("available", "true");
    if (priceRange.min) params.set("minPrice", priceRange.min);
    if (priceRange.max) params.set("maxPrice", priceRange.max);
    try {
      const result = await api(`/products?${params.toString()}`);
      if (requestId === productRequestId.current) {
        setProducts(result);
        setDemoMode(false);
      }
    } catch (error) {
      if (requestId === productRequestId.current) {
        if (import.meta.env.DEV) {
          setProducts(findPreviewProducts(search.trim(), activeCategory, sort, onlyDeals, availableOnly, priceRange));
          setDemoMode(true);
        } else tell(error.message, "error");
      }
    }
    finally { if (requestId === productRequestId.current) setLoading(false); }
  }, [search, activeCategory, sort, onlyDeals, availableOnly, priceRange, tell]);

  useEffect(() => {
    api("/categories").then(setCategories).catch(() => {
      if (import.meta.env.DEV) { setCategories(previewCategories); setDemoMode(true); }
    });
    api("/banners").then(setBanners).catch(() => {});
  }, [tell]);
  useEffect(() => {
    const timer = window.setTimeout(loadProducts, search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadProducts, search]);
  useEffect(() => {
    const path = activeCategory ? `/category/${encodeURIComponent(activeCategory)}` : "/";
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  }, [activeCategory]);
  useEffect(() => {
    const onPopState = () => setActiveCategory(decodeURIComponent(window.location.pathname.match(/^\/category\/([^/]+)$/)?.[1] || ""));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }, [cart]);

  useEffect(() => {
    if (!token || user?.role === "admin") return;
    api("/cart", {}, token).then(async (remote) => {
      const merged = new Map((remote.items || []).filter((item) => item.product).map((item) => [
        item.product._id, { product: item.product, quantity: item.quantity }
      ]));
      for (const guestItem of cartRef.current) {
        if (typeof guestItem.product !== "object" || guestItem.product._demo) continue;
        const id = guestItem.product._id;
        const remoteItem = merged.get(id);
        merged.set(id, {
          product: guestItem.product,
          quantity: Math.min(guestItem.product.quantity || 99, guestItem.quantity + (remoteItem?.quantity || 0))
        });
      }
      const combined = [...merged.values()];
      setCart(combined);
      if (combined.length) {
        await api("/cart", { method: "PUT", body: JSON.stringify({ items: combined.map(({ product, quantity }) => ({ product: product._id, quantity })) }) }, token);
      }
    }).catch((error) => tell(error.message, "error"));
  }, [token, user?.role, tell]);
  useEffect(() => {
    if (!token || user?.role === "admin") { setSavedAddresses([]); return; }
    api("/profile", {}, token).then((profile) => {
      setSavedAddresses(profile.addresses || []);
      const preferred = (profile.addresses || []).find((entry) => entry.isDefault) || profile.addresses?.[0];
      if (preferred) setAddress({
        recipient: preferred.recipient, phone: preferred.phone, line1: preferred.line1,
        line2: preferred.line2 || "", city: preferred.city, postalCode: preferred.postalCode
      });
    }).catch((error) => tell(error.message, "error"));
  }, [token, user?.role, tell]);

  const persistCart = useCallback(async (nextCart) => {
    setCart(nextCart);
    if (token) {
      try {
        await api("/cart", { method: "PUT", body: JSON.stringify({ items: nextCart.map(({ product, quantity }) => ({ product: typeof product === "string" ? product : product._id, quantity })) }) }, token);
      } catch (error) { tell(error.message, "error"); }
    }
  }, [token, tell]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => {
    const product = typeof item.product === "object" ? item.product : products.find((entry) => entry._id === item.product);
    return sum + (product?.price || 0) * item.quantity;
  }, 0), [cart, products]);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product) {
    if (!product.quantity) return tell("This item is currently out of stock.", "error");
    const id = typeof product === "string" ? product : product._id;
    const found = cart.find((entry) => (typeof entry.product === "string" ? entry.product : entry.product._id) === id);
    const next = found
      ? cart.map((entry) => (typeof entry.product === "string" ? entry.product : entry.product._id) === id ? { ...entry, quantity: Math.min(entry.quantity + 1, product.quantity) } : entry)
      : [...cart, { product, quantity: 1 }];
    persistCart(next);
    tell(`${product.name} added to your basket`);
  }

  function updateQuantity(productId, delta) {
    const next = cart.map((item) => {
      const id = typeof item.product === "string" ? item.product : item.product._id;
      const product = typeof item.product === "object" ? item.product : products.find((entry) => entry._id === id);
      if (id !== productId) return item;
      return { ...item, quantity: Math.max(0, Math.min(item.quantity + delta, product?.quantity || 99)) };
    }).filter((item) => item.quantity > 0);
    persistCart(next);
  }

  async function submitAuth(event) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      if (authMode === "forgot") {
        const result = await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email: body.email }) });
        setAuthMode("login");
        tell(result.message);
        return;
      }
      if (authMode === "reset") {
        const result = await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token: resetToken, password: body.password }) });
        setAuthMode("login");
        window.history.replaceState({}, "", window.location.pathname);
        setAuthOpen(false);
        tell(result.message);
        return;
      }
      const endpoint = adminMode ? "/auth/admin/login" : authMode === "register" ? "/auth/register" : "/auth/login";
      const result = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
      localStorage.setItem("gb-token", result.token);
      const account = { ...result.user, role: result.role || "customer" };
      localStorage.setItem("gb-user", JSON.stringify(account));
      setToken(result.token); setUser(account); setAuthOpen(false);
      if (result.role === "admin") setAdminView(true);
      tell(`Welcome${result.user.name ? `, ${result.user.name.split(" ")[0]}` : " back"}!`);
    } catch (error) { tell(error.message, "error"); }
    finally { setBusy(false); }
  }

  function signOut() {
    localStorage.removeItem("gb-token"); localStorage.removeItem("gb-user");
    setToken(""); setUser(null); setAdminView(false);
    tell("You've been signed out.");
  }

  async function applyCoupon() {
    if (!coupon.trim()) return;
    if (!token) { setAuthOpen(true); return tell("Sign in to apply a coupon.", "error"); }
    try {
      const result = await api("/coupons/validate", { method: "POST", body: JSON.stringify({ code: coupon, subtotal: cartTotal }) }, token);
      setCouponDiscount(result.discount); setCoupon(result.code);
      tell(`${result.code} applied — ${money(result.discount)} off`);
    } catch (error) { setCouponDiscount(0); tell(error.message, "error"); }
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (!token) { setCheckoutOpen(false); setAuthOpen(true); return tell("Please sign in before checkout.", "error"); }
    setBusy(true);
    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({ address, paymentMethod, coupon: couponDiscount ? coupon : "" })
      }, token);
      if (paymentMethod === "razorpay") {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => {
          const checkout = new window.Razorpay({
            key: result.razorpay.key,
            amount: result.razorpay.amount,
            currency: result.razorpay.currency,
            name: "GreenBasket",
            description: `Order ${result.order.orderId}`,
            order_id: result.razorpay.orderId,
            handler: async (response) => {
              try {
                const verified = await api("/payments/razorpay/verify", {
                  method: "POST",
                  body: JSON.stringify({
                    orderId: result.order.orderId,
                    razorpayOrderId: response.razorpay_order_id,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpaySignature: response.razorpay_signature
                  })
                }, token);
                setCart([]); setCheckoutOpen(false); setCartOpen(false);
                tell(`Payment confirmed. Order ${verified.order.orderId} is on its way!`);
              } catch (error) { tell(error.message, "error"); }
            },
            modal: { ondismiss: () => tell("Payment was not completed. Your order is still awaiting payment.", "error") },
            prefill: { name: address.recipient, contact: address.phone }
          });
          checkout.open();
        };
        script.onerror = () => tell("Could not load the payment service.", "error");
        document.body.appendChild(script);
        return;
      }
      setCart([]); setCoupon(""); setCouponDiscount(0);
      setCheckoutOpen(false); setCartOpen(false);
      if (!savedAddresses.some((saved) => saved.line1 === address.line1 && saved.recipient === address.recipient)) {
        try {
          const saved = await api("/profile/addresses", { method: "POST", body: JSON.stringify({ ...address, label: "Home", isDefault: savedAddresses.length === 0 }) }, token);
          setSavedAddresses((existing) => [...existing, saved]);
        } catch (error) { tell(`Order placed. Address could not be saved: ${error.message}`, "error"); }
      }
      tell(`Order ${result.order.orderId} placed — we'll keep you posted!`);
    } catch (error) { tell(error.message, "error"); }
    finally { setBusy(false); }
  }

  async function showOrders() {
    if (!token) { setAuthOpen(true); return; }
    try { setOrders(await api("/orders", {}, token)); setOrdersOpen(true); }
    catch (error) { tell(error.message, "error"); }
  }

  if (adminView) return <AdminPanel token={token} user={user} onExit={() => setAdminView(false)} onSignOut={signOut} tell={tell} />;

  return (
    <div className="app-shell">
      <div className="announcement"><span>✦</span> Fresh from the farm to your door <span className="announcement-dot">·</span> Free delivery over ₹499 <button onClick={() => setOnlyDeals(true)}>Shop the offers <span>→</span></button></div>
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); setActiveCategory(""); setSearch(""); }}>
          <span className="brand-mark"><Icon>✿</Icon></span><span className="brand-name">green<span>basket</span><small>GOOD FOOD. GOOD MOOD.</small></span>
        </a>
        <button className="delivery-location" onClick={() => tell("We deliver across the city. Add your address at checkout.")}>
          <span className="location-pin">⌖</span><span><small>Delivering to</small><strong>Your doorstep <b>⌄</b></strong></span>
        </button>
        <label className="search-box">
          <Icon>⌕</Icon><input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search fresh produce, pantry staples..." />
          {search && <button aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
          <kbd>⌘ K</kbd>
        </label>
        <div className="header-actions">
          {user ? <div className="account-wrap"><button className="account-button" onClick={() => setOrdersOpen((open) => !open)}><span className="avatar">{user.name?.[0] || "G"}</span><span className="account-name">{user.name?.split(" ")[0]}<small>My account</small></span><b>⌄</b></button>{ordersOpen && <div className="account-menu"><button onClick={() => { setOrdersOpen(false); showOrders(); }}>My orders</button><button onClick={() => { setAdminMode(true); setAuthOpen(true); setOrdersOpen(false); }}>Admin sign in</button><button onClick={signOut}>Sign out</button></div>}</div> :
            <><button className="login-button" onClick={() => { setAdminMode(false); setAuthOpen(true); }}>Sign in</button><button className="signup-button" onClick={() => { setAdminMode(false); setAuthMode("register"); setAuthOpen(true); }}>Join us <span>↗</span></button></>}
          <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Open basket, ${itemCount} items`}><span>♧</span><b>Basket</b>{itemCount > 0 && <i>{itemCount}</i>}</button>
        </div>
      </header>

      <main>
        <section className="hero-wrap">
          <div className="hero">
            <div className="hero-copy">
              <span className="eyebrow"><span></span> GOOD FOOD, GROWN CLOSE</span>
              <h1>A little more<br />goodness, <em>every day.</em></h1>
              <p>Farm-fresh produce and everyday favourites, picked with care and brought to your door.</p>
              <button className="hero-button" onClick={() => document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" })}>Shop fresh picks <span>→</span></button>
              <div className="hero-trust"><div className="trust-avatars"><i>👩🏽</i><i>👨🏻</i><i>👩🏼</i></div><span><b>4.9/5</b> from 2,400+ happy homes</span></div>
            </div>
            <div className="hero-art" aria-label="Fresh fruits and vegetables">
              <div className="hero-image"></div><div className="hero-sticker"><span>✿</span><b>Freshness<br />you can feel.</b></div>
              <div className="hero-note"><span>✳</span> Picked this morning<br /><small>Delivered with love</small></div>
            </div>
            <div className="hero-index">01 <span>—</span> 03</div>
          </div>
          <div className="service-strip">
            <div><span className="service-icon">✿</span><span><b>Fresh, always</b><small>From farms we know</small></span></div>
            <div><span className="service-icon">⌁</span><span><b>At your door in 2 hrs</b><small>Same-day delivery</small></span></div>
            <div><span className="service-icon">♡</span><span><b>Good for you & earth</b><small>Thoughtfully sourced</small></span></div>
            <div><span className="service-icon">↺</span><span><b>Love it or it's on us</b><small>Happiness guaranteed</small></span></div>
          </div>
        </section>

        <section className="category-section">
          <div className="section-heading"><div><span className="eyebrow">A LITTLE SOMETHING FOR EVERYONE</span><h2>Shop by <em>category</em></h2></div><button className="text-link" onClick={() => setActiveCategory("")}>View all categories <span>→</span></button></div>
          <div className="category-rail">
            <button className={`category-chip ${!activeCategory ? "selected" : ""}`} onClick={() => setActiveCategory("")}><span className="category-emoji">✳</span><b>Everything</b></button>
            {categories.map((category, index) => <button key={category._id} className={`category-chip ${activeCategory === category.slug ? "selected" : ""}`} onClick={() => { setActiveCategory(category.slug); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}><span className={`category-emoji category-color-${index % 6}`}>{category.icon}</span><b>{category.name}</b></button>)}
          </div>
        </section>

        {!search && !activeCategory && <section className="promo-band">
          <div className="promo-copy"><span className="eyebrow">{banners[0]?.eyebrow || "A FRESH START TO YOUR WEEK"}</span><h2>{(banners[0]?.title || "Little things. Big savings.").split(". ").map((line, index) => <span key={line}>{index > 0 && <br />}{index === 1 ? <em>{line}</em> : line}{index === 0 && "."}</span>)}</h2><p>{banners[0]?.subtitle || "Stock up on pantry favourites and save on every basket."}</p><button onClick={() => { setOnlyDeals(true); document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" }); }}>See this week's offers <span>→</span></button></div>
          <div className="promo-art"><span>UP TO</span><b>{(banners[0]?.offerLabel || "UP TO 25% OFF YOUR FAVOURITES").match(/\d+/)?.[0] || "25"}<small>%</small></b><span>OFF YOUR FAVOURITES</span><div className="promo-fruit">🍋</div></div>
          <div className="promo-bottom">GOOD THINGS ARE GROWING <span>✿ &nbsp; SAVE WITH CODE &nbsp; <b>{banners[0]?.offerCode || "FRESH25"}</b></span></div>
        </section>}

        <section className="products-section" id="shop">
          <div className="section-heading products-heading"><div><span className="eyebrow">{search ? "FIND YOUR FAVOURITES" : activeCategory ? "FRESHLY PICKED FOR YOU" : "THE GOOD STUFF, RIGHT NOW"}</span><h2>{search ? <>Results for <em>“{search}”</em></> : activeCategory ? <>{categories.find((category) => category.slug === activeCategory)?.name || activeCategory}</> : <>Today’s <em>good picks</em></>}</h2><p className="section-subtitle">{products.length} lovely things, picked just for you.</p></div>
            <button className="view-all" onClick={() => { setOnlyDeals(false); setActiveCategory(""); setSearch(""); }}>Explore all <span>↗</span></button>
          </div>
          {demoMode && <div className="preview-notice"><span>✿</span><span><b>10-item preview catalog</b> — showing sample products while the API is offline. Connect MongoDB and run <code>npm run seed</code> for live inventory and checkout.</span></div>}
          <div className="filter-toolbar">
            <div className="filter-left"><button className={`filter-pill ${onlyDeals ? "filter-active" : ""}`} onClick={() => setOnlyDeals(!onlyDeals)}><span>✧</span> On offer</button><button className={`filter-pill ${availableOnly ? "filter-active" : ""}`} onClick={() => setAvailableOnly(!availableOnly)}>In stock</button><label className="price-filter"><span>₹</span><input aria-label="Minimum price" type="number" min="0" placeholder="Min" value={priceRange.min} onChange={(event) => setPriceRange({ ...priceRange, min: event.target.value })} /><span>—</span><input aria-label="Maximum price" type="number" min="0" placeholder="Max" value={priceRange.max} onChange={(event) => setPriceRange({ ...priceRange, max: event.target.value })} /></label></div>
            <label className="sort-select"><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="">Recommended</option><option value="popular">Most popular</option><option value="rating">Top rated</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="newest">Recently added</option></select></label>
          </div>
          {loading ? <div className="loading-state"><span className="spinner"></span><p>Finding the freshest picks...</p></div> : products.length ? <div className="product-grid">
            {products.map((product, index) => <ProductCard key={product._id} product={product} index={index} onAdd={() => addToCart(product)} onDetails={() => setSelectedProduct(product)} />)}
          </div> : <div className="empty-products"><span>🌱</span><h3>No products found just yet.</h3><p>Try adjusting your filters or searching for something else.</p><button onClick={() => { setSearch(""); setActiveCategory(""); setOnlyDeals(false); setAvailableOnly(false); setPriceRange({ min: "", max: "" }); }}>Clear filters</button></div>}
        </section>

        <section className="promise-section"><span className="promise-flower">✿</span><span className="eyebrow">FROM OUR FAMILY TO YOURS</span><h2>Good food should feel <em>good.</em></h2><p>We work with growers and makers who care about what goes into your basket as much as you do.</p><div className="promise-stats"><div><b>120+</b><span>local growers</span></div><i></i><div><b>2 hours</b><span>farm to doorstep</span></div><i></i><div><b>100%</b><span>good intentions</span></div></div></section>
      </main>
      <footer className="site-footer"><div className="footer-main">
        <div className="footer-brand"><a className="brand" href="#"><span className="brand-mark"><Icon>✿</Icon></span><span className="brand-name">green<span>basket</span><small>GOOD FOOD. GOOD MOOD.</small></span></a><p>Good food, thoughtfully grown.<br />A little more goodness, every day.</p><div className="social-links"><a href="https://instagram.com" aria-label="Instagram">ig</a><a href="https://facebook.com" aria-label="Facebook">f</a><a href="https://youtube.com" aria-label="YouTube">▶</a></div></div>
        <div><b>Good things</b><a href="#shop">Shop all</a><a href="#shop" onClick={() => setOnlyDeals(true)}>Offers & deals</a><a href="#shop">Our story</a><a href="#shop">Meet our growers</a></div>
        <div><b>Here to help</b><a href="mailto:hello@greenbasket.in">Contact us</a><a href="#shop" onClick={(event) => { event.preventDefault(); showOrders(); }}>Track your order</a><a href="#shop">Delivery info</a><a href="#shop">FAQs</a></div>
        <div className="newsletter"><b>A little goodness in your inbox.</b><p>Fresh picks, seasonal recipes & little surprises.</p><form onSubmit={(event) => { event.preventDefault(); tell("You're on the list — see you in your inbox!"); event.currentTarget.reset(); }}><input type="email" placeholder="Your email address" required aria-label="Email for newsletter" /><button aria-label="Subscribe">→</button></form><small>By subscribing, you agree to our good things only policy.</small></div>
      </div><div className="footer-bottom"><span>© 2025 GreenBasket. Grown with care.</span><span><a href="#shop">Privacy</a><a href="#shop">Terms</a><button onClick={() => { setAdminMode(true); setAuthOpen(true); }}>Team login</button></span><span>Made for good living &nbsp; ✿</span></div></footer>

      {cartOpen && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && setCartOpen(false)}><aside className="side-drawer">
        <div className="drawer-heading"><div><span className="eyebrow">YOUR GOOD THINGS</span><h2>Your basket <span>({itemCount})</span></h2></div><button className="close-button" onClick={() => setCartOpen(false)}>×</button></div>
        <div className="drawer-content">{!cart.length ? <div className="empty-cart"><span>🧺</span><h3>Your basket's feeling lonely.</h3><p>Let's find some fresh things for it.</p><button onClick={() => setCartOpen(false)}>Keep exploring</button></div> : cart.map((item) => {
          const product = typeof item.product === "object" ? item.product : products.find((entry) => entry._id === item.product);
          if (!product) return null;
          return <div className="cart-line" key={product._id}><img src={product.image} alt="" /><div className="cart-line-info"><b>{product.name}</b><small>{product.unit}</small><strong>{money(product.price)}</strong></div><div className="quantity-control"><button aria-label="Decrease quantity" onClick={() => updateQuantity(product._id, -1)}>−</button><span>{item.quantity}</span><button aria-label="Increase quantity" onClick={() => updateQuantity(product._id, 1)}>+</button></div></div>;
        })}</div>
        {cart.length > 0 && <div className="drawer-summary"><div className="coupon-input"><input placeholder="Have a little code?" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} /><button onClick={applyCoupon}>Apply</button></div><div className="summary-row"><span>Subtotal</span><b>{money(cartTotal)}</b></div><div className="summary-row"><span>Delivery</span><b>{cartTotal >= 499 ? <span className="free-delivery">On us!</span> : money(39)}</b></div>{couponDiscount > 0 && <div className="summary-row savings"><span>Your savings</span><b>−{money(couponDiscount)}</b></div>}<div className="summary-row total"><span>Little total</span><b>{money(Math.max(0, cartTotal + (cartTotal >= 499 ? 0 : 39) - couponDiscount))}</b></div><button className="checkout-button" onClick={() => { if (!token) { setCartOpen(false); setAuthOpen(true); return; } setCheckoutOpen(true); setCartOpen(false); }}>Continue to checkout <span>→</span></button><p className="delivery-note">✿ &nbsp;Free delivery on orders over ₹499</p></div>}
      </aside></div>}

      {selectedProduct && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedProduct(null)}><section className="product-modal"><button className="close-button modal-close" onClick={() => setSelectedProduct(null)}>×</button><img src={selectedProduct.image} alt={selectedProduct.name} /><div className="product-modal-copy"><span className="eyebrow">{selectedProduct.category?.name || "FRESHLY PICKED"}</span><h2>{selectedProduct.name}</h2><p className="product-modal-brand">{selectedProduct.brand} · {selectedProduct.unit}</p><div className="product-modal-rating"><b>★</b> {Number(selectedProduct.rating || 0).toFixed(1)} <span>({selectedProduct.reviewCount || 0} happy reviews)</span></div><p className="product-modal-description">{selectedProduct.description || "A lovely, thoughtfully sourced pick for your home."}</p><div className="product-modal-price"><strong>{money(selectedProduct.price)}</strong>{selectedProduct.originalPrice > selectedProduct.price && <><del>{money(selectedProduct.originalPrice)}</del><span>Save {Math.round((1 - selectedProduct.price / selectedProduct.originalPrice) * 100)}%</span></>}</div><p className={`product-modal-stock ${selectedProduct.quantity ? "" : "low-stock"}`}>{selectedProduct.quantity ? `${selectedProduct.quantity} ${selectedProduct.unit} available` : "Currently unavailable"}</p><div className="product-modal-actions"><button className="checkout-button" disabled={!selectedProduct.quantity} onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); }}>{selectedProduct.quantity ? "Add to basket" : "Sold out"}</button><button className="buy-now-modal" disabled={!selectedProduct.quantity} onClick={() => { addToCart(selectedProduct); setSelectedProduct(null); setCartOpen(true); }}>Buy now →</button></div></div></section></div>}

      {authOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}><section className="auth-modal">
        <button className="close-button modal-close" onClick={() => setAuthOpen(false)}>×</button>        <div className="auth-mark">✿</div><span className="eyebrow">{adminMode ? "A LITTLE BACKSTAGE ACCESS" : "GOOD TO HAVE YOU HERE"}</span><h2>{adminMode ? "Team sign in" : authMode === "register" ? "Join the good side." : authMode === "forgot" ? "Let's get you back in." : authMode === "reset" ? "A fresh start." : "Welcome back."}</h2><p>{adminMode ? "Sign in to manage your GreenBasket store." : authMode === "forgot" ? "We'll send a secure reset link if we find your account." : authMode === "reset" ? "Choose a new password for your account." : "Sign in for a basket full of good things."}</p>
        <form className="auth-form" onSubmit={submitAuth}>{!adminMode && authMode === "register" && <label>Your name<input name="name" required minLength="2" placeholder="How should we call you?" /></label>}{authMode !== "reset" && <label>Email address<input name="email" type="email" required placeholder="you@example.com" /></label>}{authMode !== "forgot" && <label>Password<input name="password" type="password" required minLength={authMode === "register" && !adminMode || authMode === "reset" ? "8" : "1"} placeholder="At least 8 characters" /></label>}{!adminMode && authMode === "login" && <button type="button" className="forgot-link" onClick={() => setAuthMode("forgot")}>Forgot password?</button>}<button className="checkout-button" disabled={busy}>{busy ? "One moment..." : adminMode ? "Sign in to dashboard →" : authMode === "register" ? "Create your account →" : authMode === "forgot" ? "Send reset link →" : authMode === "reset" ? "Set a new password →" : "Sign in →"}</button></form>
        {!adminMode && <button className="auth-switch" onClick={() => setAuthMode(authMode === "register" ? "login" : authMode === "forgot" || authMode === "reset" ? "login" : "register")}>{authMode === "register" ? "Already have an account? Sign in" : authMode === "forgot" || authMode === "reset" ? "Back to sign in" : "New to GreenBasket? Create an account"}</button>}
        {adminMode && <button className="auth-switch" onClick={() => setAdminMode(false)}>Customer sign in</button>}
      </section></div>}

      {checkoutOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCheckoutOpen(false)}><section className="checkout-modal">
        <div className="drawer-heading"><div><span className="eyebrow">ALMOST AT YOUR DOOR</span><h2>Delivery details</h2></div><button className="close-button" onClick={() => setCheckoutOpen(false)}>×</button></div>
        {savedAddresses.length > 0 && <label className="saved-address-select">Saved address<select onChange={(event) => { const selected = savedAddresses.find((entry) => entry._id === event.target.value); if (selected) setAddress({ recipient: selected.recipient, phone: selected.phone, line1: selected.line1, line2: selected.line2 || "", city: selected.city, postalCode: selected.postalCode }); }} defaultValue=""><option value="" disabled>Choose an address or enter a new one</option>{savedAddresses.map((entry) => <option value={entry._id} key={entry._id}>{entry.label} · {entry.line1}, {entry.city}</option>)}</select></label>}
        <form onSubmit={placeOrder}><div className="checkout-fields"><label>Full name<input required minLength="2" value={address.recipient} onChange={(event) => setAddress({ ...address, recipient: event.target.value })} placeholder="Name on the door" /></label><label>Phone number<input required minLength="7" value={address.phone} onChange={(event) => setAddress({ ...address, phone: event.target.value })} placeholder="For delivery updates" /></label><label className="field-wide">Street address<input required minLength="4" value={address.line1} onChange={(event) => setAddress({ ...address, line1: event.target.value })} placeholder="House number and street" /></label><label className="field-wide">Landmark (optional)<input value={address.line2} onChange={(event) => setAddress({ ...address, line2: event.target.value })} placeholder="Apartment, floor, nearby landmark" /></label><label>City<input required minLength="2" value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} placeholder="Your city" /></label><label>PIN code<input required minLength="3" value={address.postalCode} onChange={(event) => setAddress({ ...address, postalCode: event.target.value })} placeholder="Postal code" /></label></div>
          <div className="payment-choice"><span>HOW WOULD YOU LIKE TO PAY?</span><label><input type="radio" name="payment" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} /><span><b>Cash on delivery</b><small>Pay when your basket arrives</small></span><i>✓</i></label><label><input type="radio" name="payment" value="razorpay" checked={paymentMethod === "razorpay"} onChange={() => setPaymentMethod("razorpay")} /><span><b>Pay online</b><small>Secure checkout with Razorpay</small></span><i>✓</i></label></div>
          <div className="checkout-total"><span>{itemCount} good things · Total</span><b>{money(Math.max(0, cartTotal + (cartTotal >= 499 ? 0 : 39) - couponDiscount))}</b></div><button className="checkout-button" disabled={busy || cart.length === 0}>{busy ? "Placing your order..." : paymentMethod === "cod" ? "Place my order →" : "Continue to secure payment →"}</button>
        </form>
      </section></div>}

      {ordersOpen && !user?.name?.includes("Admin") && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOrdersOpen(false)}><section className="orders-modal"><div className="drawer-heading"><div><span className="eyebrow">A LITTLE UPDATE</span><h2>Your orders</h2></div><button className="close-button" onClick={() => setOrdersOpen(false)}>×</button></div>{orders.length ? <div className="orders-list">{orders.map((order) => <article key={order._id}><div><b>{order.orderId}</b><span>{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div><strong>{order.status}</strong><b>{money(order.total)}</b><small>{order.items.length} items · {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentStatus}</small></article>)}</div> : <div className="empty-cart"><span>🧺</span><h3>No orders just yet.</h3><p>Your next delivery is only a few good things away.</p></div>}</section></div>}
      {notice && <div className={`toast ${notice.kind}`} role="status"><span>{notice.kind === "error" ? "!" : "✓"}</span>{notice.message}<button onClick={() => setNotice(null)}>×</button></div>}
      <button className="floating-help" aria-label="Contact support" onClick={() => window.location.href = "mailto:hello@greenbasket.in"}>✳<span>Need a hand?</span></button>
    </div>
  );
}

function ProductCard({ product, index, onAdd, onDetails }) {
  const discount = product.originalPrice > product.price ? Math.round((1 - product.price / product.originalPrice) * 100) : 0;
  return <article className="product-card" style={{ "--card-order": index }}>
    <div className="product-image-wrap"><img src={product.image} alt={product.name} loading="lazy" /><div className="product-badges">{discount > 0 && <span className="discount-badge">−{discount}%</span>}{product.featured && <span className="fresh-badge">✿ Fresh pick</span>}</div><button className="quick-add" onClick={onAdd} disabled={!product.quantity} aria-label={`Add ${product.name} to basket`}>{product.quantity ? "+" : "×"}</button></div>
    <div className="product-details"><div className="product-meta"><span>{product.category?.name || "Pantry"}</span><span className="rating"><b>★</b> {Number(product.rating || 0).toFixed(1)} <small>({product.reviewCount || 0})</small></span></div><button className="product-title" onClick={onDetails}>{product.name}</button><p className="product-brand">{product.brand} <span>·</span> {product.unit}</p><div className="product-buy-row"><div><strong>{money(product.price)}</strong>{product.originalPrice > product.price && <del>{money(product.originalPrice)}</del>}</div><button className="add-button" onClick={onAdd} disabled={!product.quantity}>{product.quantity ? <><span>+</span> Add</> : "Sold out"}</button></div><span className={`stock-label ${product.quantity < 10 ? "low-stock" : ""}`}>{product.quantity ? `${product.quantity < 10 ? "Only " : ""}${product.quantity} left` : "Currently unavailable"}</span><button className="details-link" onClick={onDetails}>Good things about this →</button></div>
  </article>;
}

function AdminPanel({ token, user, onExit, onSignOut, tell }) {
  const [overview, setOverview] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [promoBanners, setPromoBanners] = useState([]);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [categoryDraft, setCategoryDraft] = useState({ name: "", icon: "🛒" });
  const load = useCallback(async () => {
    try {
        const [stats, items, allCategories, allOrders, allCustomers, allCoupons, allBanners] = await Promise.all([
          api("/admin/overview", {}, token), api("/admin/products", {}, token), api("/admin/categories", {}, token),
          api("/admin/orders", {}, token), api("/admin/customers", {}, token), api("/admin/coupons", {}, token), api("/admin/banners", {}, token)
      ]);
        setOverview(stats); setProducts(items); setOrders(allOrders); setCategories(allCategories);
        setCustomers(allCustomers); setCoupons(allCoupons); setPromoBanners(allBanners);
    } catch (error) { tell(error.message, "error"); }
  }, [token, tell]);
  useEffect(() => { load(); }, [load]);
  async function saveProduct(event) {
    event.preventDefault(); setSaving(true);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.price = Number(data.price); data.originalPrice = Number(data.originalPrice); data.quantity = Number(data.quantity);
    try {
      if (editing?._id) await api(`/admin/products/${editing._id}`, { method: "PATCH", body: JSON.stringify(data) }, token);
      else await api("/admin/products", { method: "POST", body: JSON.stringify(data) }, token);
      setEditing(null); await load(); tell("Product saved.");
    } catch (error) { tell(error.message, "error"); }
    finally { setSaving(false); }
  }
  async function uploadProductImage(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      tell("Choose an image file smaller than 5 MB.", "error");
      input.value = "";
      return;
    }
    setUploadingImage(true);
    try {
      const signature = await api("/admin/uploads/signature", { method: "POST" }, token);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signature.apiKey);
      formData.append("timestamp", String(signature.timestamp));
      formData.append("folder", signature.folder);
      formData.append("public_id", signature.public_id);
      formData.append("signature", signature.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Image upload failed");
      setImageUrl(result.secure_url);
      tell("Product image uploaded.");
    } catch (error) { tell(error.message, "error"); }
    finally { setUploadingImage(false); input.value = ""; }
  }
  async function updateOrder(id, status) {
    try { await api(`/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }, token); await load(); tell("Order status updated."); }
    catch (error) { tell(error.message, "error"); }
  }
  async function archiveProduct(product) {
    if (!window.confirm(`Archive ${product.name}?`)) return;
    try { await api(`/admin/products/${product._id}`, { method: "DELETE" }, token); await load(); tell("Product archived."); }
    catch (error) { tell(error.message, "error"); }
  }
  async function addCategory(event) {
    event.preventDefault();
    try {
      await api("/admin/categories", { method: "POST", body: JSON.stringify(categoryDraft) }, token);
      setCategoryDraft({ name: "", icon: "🛒" }); await load(); tell("Category added.");
    } catch (error) { tell(error.message, "error"); }
  }
  async function removeCategory(category) {
    if (!window.confirm(`Delete ${category.name}?`)) return;
    try { await api(`/admin/categories/${category._id}`, { method: "DELETE" }, token); await load(); tell("Category deleted."); }
    catch (error) { tell(error.message, "error"); }
  }
  async function addCoupon(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    data.discountPercent = Number(data.discountPercent); data.minimumOrder = Number(data.minimumOrder || 0);
    if (data.expiresAt) data.expiresAt = new Date(data.expiresAt).toISOString();
    else delete data.expiresAt;
    try { await api("/admin/coupons", { method: "POST", body: JSON.stringify(data) }, token); form.reset(); await load(); tell("Offer created."); }
    catch (error) { tell(error.message, "error"); }
  }
  async function toggleCoupon(coupon) {
    try { await api(`/admin/coupons/${coupon._id}`, { method: "PATCH", body: JSON.stringify({ active: !coupon.active }) }, token); await load(); }
    catch (error) { tell(error.message, "error"); }
  }
  async function addBanner(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try { await api("/admin/banners", { method: "POST", body: JSON.stringify(data) }, token); form.reset(); await load(); tell("Promotion added."); }
    catch (error) { tell(error.message, "error"); }
  }
  async function toggleBanner(banner) {
    try { await api(`/admin/banners/${banner._id}`, { method: "PATCH", body: JSON.stringify({ active: !banner.active }) }, token); await load(); }
    catch (error) { tell(error.message, "error"); }
  }
  async function removeBanner(banner) {
    if (!window.confirm("Remove this promotion banner?")) return;
    try { await api(`/admin/banners/${banner._id}`, { method: "DELETE" }, token); await load(); tell("Promotion removed."); }
    catch (error) { tell(error.message, "error"); }
  }
  return <div className="admin-shell"><header className="admin-header"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); onExit(); }}><span className="brand-mark"><Icon>✿</Icon></span><span className="brand-name">green<span>basket</span><small>GOOD FOOD. GOOD MOOD.</small></span></a><span className="admin-tag">STORE STUDIO</span><div><span>Good morning, {user?.name?.split(" ")[0]}</span><button onClick={onExit}>View store</button><button onClick={onSignOut}>Sign out</button></div></header>
    <div className="admin-layout"><aside className="admin-sidebar"><span className="eyebrow">YOUR STORE</span>{[["overview", "◫", "Overview"], ["products", "▦", "Products"], ["orders", "⌑", "Orders"], ["customers", "♙", "Customers"], ["categories", "◉", "Categories"], ["coupons", "✧", "Coupons"], ["banners", "▤", "Banners"]].map(([key, icon, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setEditing(null); }}><span>{icon}</span>{label}{key === "orders" && <i>{overview?.orders || 0}</i>}</button>)}<div className="sidebar-bottom"><span>✿</span><b>A little more goodness.</b><small>Your store, your way.</small></div></aside>
      <main className="admin-content"><div className="admin-page-heading"><div><span className="eyebrow">GREENBASKET · STORE STUDIO</span><h1>{tab === "overview" ? "A lovely day to grow." : tab === "products" ? "Your products" : tab === "orders" ? "Order desk" : tab === "customers" ? "Your customers" : tab === "categories" ? "Your categories" : tab === "coupons" ? "Offers & coupons" : "Store promotions"}</h1><p>{tab === "overview" ? "Here's how your good things are doing today." : "Keep everything fresh, accurate, and ready for your customers."}</p></div>{tab === "products" && <button className="admin-primary" onClick={() => { setEditing({}); setImageUrl(""); }}>＋ Add a product</button>}</div>
      {tab === "overview" && overview && <><div className="stats-grid">{[["Products", overview.products, "✿", "In your shop"], ["Customers", overview.customers, "♡", "Good people"], ["Orders", overview.orders, "⌑", "All time"], ["Revenue", money(overview.revenue), "↗", "Total sales"]].map(([title, value, icon, note]) => <div className="stat-card" key={title}><span>{icon}</span><small>{title}</small><b>{value}</b><em>{note}</em></div>)}</div><SalesChart sales={overview.monthlySales || []} /><div className="admin-columns"><section className="admin-card"><div className="admin-card-heading"><div><h3>Recent orders</h3><p>Good things in motion</p></div><button onClick={() => setTab("orders")}>All orders →</button></div><div className="admin-table"><div className="table-head"><span>ORDER</span><span>CUSTOMER</span><span>TOTAL</span><span>STATUS</span></div>{orders.slice(0, 6).map((order) => <div className="table-row" key={order._id}><b>{order.orderId}</b><span>{order.user?.name || "Customer"}</span><strong>{money(order.total)}</strong><span className="status-tag">{order.status}</span></div>)}</div></section><section className="admin-card"><div className="admin-card-heading"><div><h3>Customer favourites</h3><p>The good things flying off shelves</p></div></div>{overview.bestSellers.map((item, index) => <div className="best-seller" key={item._id}><span>{String(index + 1).padStart(2, "0")}</span><img src={item.image} alt="" /><b>{item.name}</b><small>{item.popularity || 0} sold</small></div>)}</section></div></>}
      {tab === "products" && !editing && <section className="admin-card"><div className="admin-table"><div className="table-head product-table-head"><span>PRODUCT</span><span>CATEGORY</span><span>PRICE</span><span>STOCK</span><span>ACTIONS</span></div>{products.map((product) => <div className="table-row product-table-row" key={product._id}><span className="admin-product-cell"><img src={product.image} alt="" /><b>{product.name}</b></span><span>{product.category?.name}</span><strong>{money(product.price)}</strong><span className={product.quantity < 10 ? "low-stock" : ""}>{product.quantity} {product.unit}</span><span className="row-actions"><button onClick={() => { setEditing(product); setImageUrl(product.image); }}>Edit</button><button onClick={() => archiveProduct(product)}>Archive</button></span></div>)}</div></section>}
      {tab === "products" && editing && <section className="admin-card edit-product"><div className="admin-card-heading"><div><h3>{editing._id ? "A little product refresh" : "Add something good"}</h3><p>Product details customers will see in your store.</p></div><button onClick={() => setEditing(null)}>← Back to products</button></div><form onSubmit={saveProduct} className="product-edit-form"><label>Product name<input name="name" required defaultValue={editing.name || ""} /></label><label>Brand<input name="brand" defaultValue={editing.brand || "GreenBasket"} /></label><label>Category<select name="category" required defaultValue={editing.category?._id || ""}>{categories.map((category) => <option value={category._id} key={category._id}>{category.name}</option>)}</select></label><label>Unit<input name="unit" required defaultValue={editing.unit || "each"} /></label><label>Price (₹)<input name="price" type="number" min="0" required defaultValue={editing.price || ""} /></label><label>Original price (₹)<input name="originalPrice" type="number" min="0" required defaultValue={editing.originalPrice || ""} /></label><label>Available stock<input name="quantity" type="number" min="0" required defaultValue={editing.quantity ?? 0} /></label><label className="field-wide">Product image URL<input name="image" type="url" required value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} /><input type="file" accept="image/*" onChange={uploadProductImage} disabled={uploadingImage} />{uploadingImage && <small>Uploading securely...</small>}</label><label className="field-wide">Description<textarea name="description" rows="3" defaultValue={editing.description || ""} /></label><button className="admin-primary" disabled={saving || uploadingImage}>{saving ? "Saving..." : "Save product →"}</button></form></section>}
      {tab === "orders" && <section className="admin-card"><div className="admin-table"><div className="table-head order-table-head"><span>ORDER</span><span>CUSTOMER</span><span>DATE</span><span>TOTAL</span><span>STATUS</span><span>UPDATE</span></div>{orders.map((order) => <div className="table-row order-table-row" key={order._id}><b>{order.orderId}</b><span>{order.user?.name || "Customer"}<small>{order.user?.email}</small></span><span>{new Date(order.createdAt).toLocaleDateString("en-IN")}</span><strong>{money(order.total)}</strong><span className="status-tag">{order.status}</span><select value={order.status} onChange={(event) => updateOrder(order._id, event.target.value)}>{["Order Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></div>)}</div></section>}
      {tab === "customers" && <section className="admin-card"><div className="admin-table"><div className="table-head customer-table-head"><span>CUSTOMER</span><span>EMAIL</span><span>PHONE</span><span>JOINED</span></div>{customers.map((customer) => <div className="table-row customer-table-row" key={customer._id}><b>{customer.name}</b><span>{customer.email}</span><span>{customer.phone || "—"}</span><span>{new Date(customer.createdAt).toLocaleDateString("en-IN")}</span></div>)}</div></section>}
      {tab === "categories" && <section className="admin-card category-admin"><div className="admin-card-heading"><div><h3>Your shelves</h3><p>{categories.length} categories in your store</p></div></div><form className="admin-inline-form" onSubmit={addCategory}><input required minLength="2" placeholder="New category name" value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} /><input className="category-icon-input" aria-label="Category icon" value={categoryDraft.icon} onChange={(event) => setCategoryDraft({ ...categoryDraft, icon: event.target.value })} /><button className="admin-primary">Add category</button></form><div className="category-admin-grid">{categories.map((category) => <div key={category._id}><span>{category.icon}</span><b>{category.name}</b><small>/{category.slug}</small><button onClick={() => removeCategory(category)}>Delete category</button></div>)}</div></section>}
      {tab === "coupons" && <section className="admin-card category-admin"><div className="admin-card-heading"><div><h3>Little offers</h3><p>Create a coupon code customers can use at checkout.</p></div></div><form className="admin-inline-form coupon-admin-form" onSubmit={addCoupon}><input name="code" required minLength="2" placeholder="Code (e.g. GOOD20)" /><input name="discountPercent" required type="number" min="1" max="100" placeholder="% off" /><input name="minimumOrder" type="number" min="0" placeholder="Minimum ₹" /><input name="expiresAt" type="datetime-local" aria-label="Expiry date" /><button className="admin-primary">Create offer</button></form><div className="admin-list">{coupons.map((coupon) => <div key={coupon._id}><span className="coupon-code">{coupon.code}</span><b>{coupon.discountPercent}% off</b><span>Min. {money(coupon.minimumOrder)}</span><small>{coupon.expiresAt ? `Until ${new Date(coupon.expiresAt).toLocaleDateString("en-IN")}` : "No expiry"}</small><button className={coupon.active ? "" : "inactive"} onClick={() => toggleCoupon(coupon)}>{coupon.active ? "Active · turn off" : "Inactive · turn on"}</button></div>)}</div></section>}
      {tab === "banners" && <section className="admin-card category-admin"><div className="admin-card-heading"><div><h3>Promotions</h3><p>Active promotions appear on your customer storefront.</p></div></div><form className="product-edit-form banner-admin-form" onSubmit={addBanner}><label>Eyebrow<input name="eyebrow" required placeholder="A FRESH START TO YOUR WEEK" /></label><label>Headline<input name="title" required placeholder="Little things. Big savings." /></label><label className="field-wide">Description<input name="subtitle" placeholder="A little something for your customers." /></label><label>Offer label<input name="offerLabel" placeholder="UP TO 25% OFF" /></label><label>Coupon code<input name="offerCode" placeholder="FRESH25" /></label><button className="admin-primary">Add promotion</button></form><div className="admin-list">{promoBanners.map((banner) => <div key={banner._id}><span className="coupon-code">{banner.offerCode || "PROMO"}</span><b>{banner.title}</b><span>{banner.eyebrow}</span><small>{banner.subtitle}</small><button className={banner.active ? "" : "inactive"} onClick={() => toggleBanner(banner)}>{banner.active ? "Active · turn off" : "Inactive · turn on"}</button><button className="danger-action" onClick={() => removeBanner(banner)}>Remove</button></div>)}</div></section>}
      </main></div>
  </div>;
}

function SalesChart({ sales }) {
  const now = new Date();
  const periods = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: date.toLocaleString("en-IN", { month: "short" }), total: sales.find((item) => item.period === key)?.total || 0 };
  });
  const max = Math.max(...periods.map((item) => item.total), 1);
  return <section className="admin-card sales-card"><div className="admin-card-heading"><div><h3>Sales, growing over time</h3><p>Your last six months at a glance</p></div><span className="sales-total">{money(periods.reduce((sum, item) => sum + item.total, 0))}</span></div><div className="sales-chart">{periods.map((period) => <div className="sales-month" key={period.key}><span>{period.total ? money(period.total) : "—"}</span><div className="sales-bar-track"><i style={{ height: `${period.total ? Math.max(7, period.total / max * 100) : 2}%` }} /></div><small>{period.label}</small></div>)}</div></section>;
}

export default App;
