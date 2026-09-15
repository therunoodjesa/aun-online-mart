const STORE_STYLES = `
  :host {
    --ink: #050505;
    --muted: rgba(0, 0, 0, 0.58);
    --line: rgba(0, 0, 0, 0.16);
    --surface: #fafafa;
    --page-pad: clamp(20px, 3.4vw, 58px);
    --content-max: 1600px;
    display: block;
    width: 100%;
    color: var(--ink);
    background: #fff;
    font-family: Inter, Arial, sans-serif;
    box-sizing: border-box;
    container-type: inline-size;
  }

  *, *::before, *::after { box-sizing: border-box; }
  button, input, select { font: inherit; }
  button, a, select { -webkit-tap-highlight-color: transparent; }
  button { color: inherit; }

  .shell {
    width: min(100%, var(--content-max));
    margin-inline: auto;
    padding-inline: var(--page-pad);
  }

  .promo {
    display: grid;
    min-height: 80px;
    place-items: center;
    padding: 14px var(--page-pad);
    color: #fff;
    background: #000;
    font-size: clamp(13px, 1.15vw, 20px);
    font-weight: 500;
    text-align: center;
  }

  .nav {
    min-height: 118px;
    display: grid;
    grid-template-columns: minmax(205px, 1fr) auto minmax(205px, 1fr);
    align-items: center;
    gap: 34px;
  }

  .brand {
    appearance: none;
    border: 0;
    padding: 0;
    background: transparent;
    font-size: clamp(22px, 2vw, 34px);
    font-weight: 850;
    letter-spacing: -0.045em;
    text-align: left;
    cursor: pointer;
  }

  .nav-links {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(34px, 5vw, 88px);
  }

  .nav-link {
    appearance: none;
    border: 0;
    padding: 12px 4px;
    color: rgba(0,0,0,.7);
    background: transparent;
    font-size: clamp(15px, 1.15vw, 20px);
    font-weight: 500;
    cursor: pointer;
  }

  .nav-link:hover, .nav-link:focus-visible { color: #000; }
  .nav-link.is-active { color: #000; font-weight: 700; }

  .nav-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 18px;
  }

  .icon-button {
    position: relative;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .icon-button:hover, .icon-button:focus-visible { background: #f3f3f3; }
  .icon-button svg { width: 22px; height: 22px; }

  .cart-count {
    position: absolute;
    top: 2px;
    right: 0;
    min-width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    padding-inline: 4px;
    border-radius: 999px;
    color: #fff;
    background: #000;
    font-size: 9px;
    font-weight: 700;
  }

  .mobile-menu { display: none; }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    min-height: clamp(590px, 50vw, 810px);
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    padding: clamp(48px, 7vw, 105px) var(--page-pad);
  }

  .eyebrow {
    margin: 0 0 24px;
    color: var(--muted);
    font-size: clamp(15px, 1.55vw, 25px);
    font-weight: 450;
    letter-spacing: .025em;
  }

  .hero h1 {
    max-width: 780px;
    margin: 0;
    font-size: clamp(52px, 5.5vw, 96px);
    font-weight: 900;
    letter-spacing: -0.055em;
    line-height: 1.08;
  }

  .hero-description {
    max-width: 650px;
    margin: 28px 0 0;
    color: var(--muted);
    font-size: clamp(18px, 1.65vw, 29px);
    line-height: 1.22;
  }

  .hero-cta {
    min-height: 68px;
    margin-top: 48px;
    padding: 14px 26px;
    border: 1px solid #000;
    border-radius: 9px;
    background: #fff;
    font-size: clamp(17px, 1.45vw, 25px);
    cursor: pointer;
  }

  .hero-cta:hover, .hero-cta:focus-visible {
    color: #fff;
    background: #000;
  }

  .hero-media {
    min-width: 0;
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: clamp(32px, 6vw, 94px);
    overflow: hidden;
    background: rgba(249, 245, 245, 0.5);
  }

  .hero-media img {
    width: min(100%, 660px);
    max-height: 650px;
    object-fit: contain;
    filter: drop-shadow(0 24px 32px rgba(0,0,0,.10));
  }

  .catalog {
    padding-block: clamp(60px, 6vw, 100px) 80px;
  }

  .catalog-heading {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 28px;
    margin-bottom: 34px;
  }

  .breadcrumb {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: clamp(14px, 1.15vw, 20px);
  }

  .catalog-title {
    margin: 0;
    font-size: clamp(30px, 2.4vw, 42px);
    line-height: 1.1;
  }

  .product-count {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 15px;
  }

  .sort {
    min-width: min(320px, 100%);
    min-height: 68px;
    padding: 0 54px 0 24px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background:
      linear-gradient(45deg, transparent 50%, #fff 50%) calc(100% - 24px) 30px/8px 8px no-repeat,
      linear-gradient(135deg, #fff 50%, transparent 50%) calc(100% - 16px) 30px/8px 8px no-repeat,
      #000;
    font-size: clamp(16px, 1.45vw, 24px);
    font-weight: 500;
    appearance: none;
  }

  .catalog-layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    align-items: start;
    gap: clamp(28px, 3vw, 54px);
  }

  .filters {
    position: sticky;
    top: 18px;
    border-bottom: 1px solid var(--line);
  }

  .filter-section {
    padding: 24px 0 30px;
    border-top: 1px solid var(--line);
  }

  .filter-section:first-child { border-top: 0; padding-top: 0; }
  .filter-section h3 { margin: 0 0 18px; font-size: 21px; }

  .filter-options {
    display: grid;
    gap: 13px;
  }

  .check-option {
    display: grid;
    grid-template-columns: 24px 1fr;
    align-items: center;
    gap: 13px;
    color: var(--muted);
    cursor: pointer;
  }

  .check-option input {
    width: 24px;
    height: 24px;
    margin: 0;
    accent-color: #000;
  }

  .size-options, .colour-options {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .chip input { position: absolute; opacity: 0; pointer-events: none; }
  .chip span {
    min-width: 38px;
    min-height: 36px;
    display: grid;
    place-items: center;
    padding: 6px 10px;
    border: 1px solid #777;
    border-radius: 7px;
    cursor: pointer;
  }
  .chip input:checked + span { color: #fff; background: #000; border-color: #000; }

  .colour-chip span {
    width: 36px;
    height: 36px;
    display: block;
    border: 5px solid #fff;
    border-radius: 50%;
    outline: 1px solid transparent;
    cursor: pointer;
  }
  .colour-chip input { position: absolute; opacity: 0; pointer-events: none; }
  .colour-chip input:checked + span { outline-color: #000; }

  .price-range {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 10px;
  }

  .price-range input {
    width: 100%;
    min-height: 42px;
    border: 1px solid #aaa;
    border-radius: 7px;
    padding: 8px 10px;
  }

  .mobile-filters { display: none; margin-bottom: 28px; }
  .mobile-filters summary {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border: 1px solid #000;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    list-style: none;
  }
  .mobile-filters summary::-webkit-details-marker { display: none; }
  .mobile-filters .filters { position: static; padding-top: 24px; }

  .products-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: clamp(34px, 3.2vw, 58px) clamp(14px, 1.6vw, 28px);
  }

  .product-card {
    min-width: 0;
    cursor: pointer;
  }

  .product-image-wrap {
    position: relative;
    aspect-ratio: 1 / 1.18;
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 8px;
    background: rgba(202, 204, 205, 0.11);
  }

  .product-image {
    width: 86%;
    height: 86%;
    object-fit: contain;
    transition: transform .28s ease;
  }
  .product-card:hover .product-image { transform: scale(1.035); }

  .ribbon {
    position: absolute;
    z-index: 2;
    top: 16px;
    left: 16px;
    padding: 7px 12px;
    border-radius: 4px;
    color: #fff;
    background: #000;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .wishlist {
    position: absolute;
    z-index: 3;
    top: 14px;
    right: 14px;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: #fff;
    background: #000;
    cursor: pointer;
  }
  .wishlist svg { width: 21px; height: 21px; fill: transparent; }
  .wishlist.is-saved svg { fill: #fff; }

  .product-name {
    margin: 18px 0 6px;
    overflow: hidden;
    font-size: clamp(15px, 1.15vw, 20px);
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .product-price {
    margin: 0;
    font-size: clamp(16px, 1.2vw, 21px);
    font-weight: 750;
  }

  .empty-state {
    grid-column: 1 / -1;
    min-height: 280px;
    display: grid;
    place-items: center;
    color: var(--muted);
    border: 1px dashed #aaa;
    border-radius: 8px;
    text-align: center;
  }

  @container (max-width: 1180px) {
    .catalog-layout { display: block; }
    .catalog-layout > .filters { display: none; }
    .mobile-filters { display: block; }
    .mobile-filters .filters { display: block; }
    .products-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  @container (max-width: 920px) {
    .nav { grid-template-columns: 1fr auto; min-height: 92px; }
    .nav-links { display: none; }
    .mobile-menu { display: grid; }
    .hero { grid-template-columns: 1fr; }
    .hero-copy { padding-block: 58px; }
    .hero-media { min-height: 520px; }
    .catalog-heading { grid-template-columns: 1fr; align-items: start; }
    .sort { width: 100%; }
    .products-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @container (max-width: 680px) {
    .promo { min-height: 54px; }
    .nav-actions .search-action, .nav-actions .account-action { display: none; }
    .brand { font-size: 21px; }
    .hero h1 { font-size: clamp(42px, 13vw, 66px); }
    .hero-description { font-size: 18px; }
    .hero-media { min-height: 400px; padding: 32px; }
    .products-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @container (max-width: 430px) {
    .shell { padding-inline: 16px; }
    .products-grid { gap: 32px 12px; }
    .product-image-wrap { aspect-ratio: 1 / 1.28; }
    .wishlist { width: 36px; height: 36px; top: 10px; right: 10px; }
  }
`;

const ICONS = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  account: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 20c.6-4 2.7-6 6.5-6s5.9 2 6.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 8.5h13.6l-1 11H6.2l-1-11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9V6.7a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 4.2 13A5.2 5.2 0 0 1 11.6 5.6L12 6l.4-.4A5.2 5.2 0 0 1 19.8 13L12 20.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sendAction(element, action, payload = {}) {
  element.dispatchEvent(new CustomEvent("storefront-action", {
    bubbles: true,
    composed: true,
    detail: { action, ...payload }
  }));
}

class StoreHeader extends HTMLElement {
  static get observedAttributes() { return ["brand", "promo", "cart-count"]; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  render() {
    const brand = this.getAttribute("brand") || "THE 17TH CENTURY";
    const promo = this.getAttribute("promo") || "Free shipping on qualifying orders · Returns within 30 days";
    const cartCount = Number(this.getAttribute("cart-count") || 0);

    this.shadowRoot.innerHTML = `
      <style>${STORE_STYLES}</style>
      <div class="promo">${escapeHtml(promo)}</div>
      <div class="shell">
        <nav class="nav" aria-label="Main navigation">
          <button class="brand" data-action="home">${escapeHtml(brand)}</button>
          <div class="nav-links">
            <button class="nav-link is-active" data-action="collection" data-value="new">New</button>
            <button class="nav-link" data-action="collection" data-value="women">Women</button>
            <button class="nav-link" data-action="collection" data-value="men">Men</button>
            <button class="nav-link" data-action="collection" data-value="sale">Sale</button>
          </div>
          <div class="nav-actions">
            <button class="icon-button search-action" data-action="search" aria-label="Search">${ICONS.search}</button>
            <button class="icon-button account-action" data-action="account" aria-label="Account">${ICONS.account}</button>
            <button class="icon-button" data-action="cart" aria-label="Cart">
              ${ICONS.bag}
              ${cartCount ? `<span class="cart-count">${cartCount > 99 ? "99+" : cartCount}</span>` : ""}
            </button>
            <button class="icon-button mobile-menu" data-action="menu" aria-label="Menu">${ICONS.menu}</button>
          </div>
        </nav>
      </div>`;

    this.shadowRoot.addEventListener("click", (event) => {
      const control = event.target.closest("[data-action]");
      if (!control) return;
      sendAction(this, control.dataset.action, { value: control.dataset.value || "" });
    });
  }
}

class StoreLanding extends HTMLElement {
  static get observedAttributes() {
    return ["products", "hero-image", "hero-title", "hero-copy", "hero-eyebrow", "currency-locale"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.state = {
      categories: new Set(),
      sizes: new Set(),
      colours: new Set(),
      minPrice: "",
      maxPrice: "",
      sort: "featured",
      wishlist: new Set()
    };
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }

  get products() {
    return safeJson(this.getAttribute("products"), []);
  }

  formatPrice(product) {
    const amount = Number(product.discountedPrice ?? product.price ?? 0);
    try {
      return new Intl.NumberFormat(this.getAttribute("currency-locale") || "en-NG", {
        style: "currency",
        currency: product.currency || "NGN",
        maximumFractionDigits: 0
      }).format(amount);
    } catch {
      return `${product.currency || ""} ${amount.toLocaleString()}`.trim();
    }
  }

  filteredProducts() {
    let items = [...this.products];
    const { categories, sizes, colours, minPrice, maxPrice, sort } = this.state;

    if (categories.size) {
      items = items.filter((item) => (item.categories || []).some((value) => categories.has(value)));
    }
    if (sizes.size) {
      items = items.filter((item) => (item.sizes || []).some((value) => sizes.has(value)));
    }
    if (colours.size) {
      items = items.filter((item) => (item.colours || []).some((value) => colours.has(value)));
    }
    if (minPrice !== "") items = items.filter((item) => Number(item.discountedPrice ?? item.price) >= Number(minPrice));
    if (maxPrice !== "") items = items.filter((item) => Number(item.discountedPrice ?? item.price) <= Number(maxPrice));

    if (sort === "price-low") items.sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-high") items.sort((a, b) => Number(b.price) - Number(a.price));
    if (sort === "name") items.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (sort === "newest") items.sort((a, b) => new Date(b.createdDate || 0) - new Date(a.createdDate || 0));

    return items;
  }

  renderFilters(categories, sizes, colours) {
    const categoryMarkup = categories.map((category) => `
      <label class="check-option">
        <input type="checkbox" data-filter="category" value="${escapeHtml(category)}"
          ${this.state.categories.has(category) ? "checked" : ""}>
        <span>${escapeHtml(category)}</span>
      </label>`).join("");

    const sizeMarkup = sizes.map((size) => `
      <label class="chip">
        <input type="checkbox" data-filter="size" value="${escapeHtml(size)}"
          ${this.state.sizes.has(size) ? "checked" : ""}>
        <span>${escapeHtml(size)}</span>
      </label>`).join("");

    const colourMarkup = colours.map((colour) => `
      <label class="colour-chip" title="${escapeHtml(colour)}">
        <input type="checkbox" data-filter="colour" value="${escapeHtml(colour)}"
          ${this.state.colours.has(colour) ? "checked" : ""}>
        <span style="background:${escapeHtml(colour)}"></span>
      </label>`).join("");

    return `
      <aside class="filters" aria-label="Product filters">
        <section class="filter-section">
          <h3>Category</h3>
          <div class="filter-options">${categoryMarkup || `<span class="product-count">Collections appear here automatically.</span>`}</div>
        </section>
        <section class="filter-section">
          <h3>Size</h3>
          <div class="size-options">${sizeMarkup || `<span class="product-count">No size options found.</span>`}</div>
        </section>
        <section class="filter-section">
          <h3>Colour</h3>
          <div class="colour-options">${colourMarkup || `<span class="product-count">No colour options found.</span>`}</div>
        </section>
        <section class="filter-section">
          <h3>Price</h3>
          <div class="price-range">
            <input type="number" min="0" inputmode="numeric" data-filter="min-price" placeholder="₦0" value="${escapeHtml(this.state.minPrice)}">
            <span>–</span>
            <input type="number" min="0" inputmode="numeric" data-filter="max-price" placeholder="Max" value="${escapeHtml(this.state.maxPrice)}">
          </div>
        </section>
      </aside>`;
  }

  renderCards(items) {
    if (!items.length) return `<div class="empty-state">No products match these filters.</div>`;

    return items.map((product) => `
      <article class="product-card" data-product-id="${escapeHtml(product.id)}" data-url="${escapeHtml(product.url || "")}" tabindex="0">
        <div class="product-image-wrap">
          ${product.ribbon ? `<span class="ribbon">${escapeHtml(product.ribbon)}</span>` : ""}
          <button class="wishlist ${this.state.wishlist.has(product.id) ? "is-saved" : ""}"
            data-wishlist="${escapeHtml(product.id)}" aria-label="Save ${escapeHtml(product.name)}">${ICONS.heart}</button>
          <img class="product-image" src="${escapeHtml(product.image || "")}" alt="${escapeHtml(product.name)}" loading="lazy">
        </div>
        <h3 class="product-name">${escapeHtml(product.name)}</h3>
        <p class="product-price">${escapeHtml(this.formatPrice(product))}</p>
      </article>`).join("");
  }

  render() {
    const products = this.products.slice(0, 12);
    const categories = unique(products.flatMap((item) => item.categories || [])).slice(0, 8);
    const sizes = unique(products.flatMap((item) => item.sizes || [])).slice(0, 10);
    const colours = unique(products.flatMap((item) => item.colours || [])).slice(0, 10);
    const heroImage = this.getAttribute("hero-image") || products[0]?.image || "";
    const filtered = this.filteredProducts().slice(0, 12);
    const filters = this.renderFilters(categories, sizes, colours);

    this.shadowRoot.innerHTML = `
      <style>${STORE_STYLES}</style>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(this.getAttribute("hero-eyebrow") || "NEW ARRIVALS")}</p>
          <h1>${escapeHtml(this.getAttribute("hero-title") || "Designed to dress you up, from head to toes.")}</h1>
          <p class="hero-description">${escapeHtml(this.getAttribute("hero-copy") || "Made for people building a style of their own—one considered piece at a time.")}</p>
          <button class="hero-cta" data-action="shop">Shop the new collection</button>
        </div>
        <div class="hero-media">
          ${heroImage ? `<img src="${escapeHtml(heroImage)}" alt="">` : ""}
        </div>
      </section>

      <section class="catalog shell" id="catalog">
        <div class="catalog-heading">
          <div>
            <p class="breadcrumb">Home / Shop / All</p>
            <h2 class="catalog-title">All products</h2>
            <p class="product-count">${products.length} products shown</p>
          </div>
          <select class="sort" aria-label="Sort products">
            <option value="featured" ${this.state.sort === "featured" ? "selected" : ""}>Sort: featured</option>
            <option value="newest" ${this.state.sort === "newest" ? "selected" : ""}>Newest</option>
            <option value="price-low" ${this.state.sort === "price-low" ? "selected" : ""}>Price: low to high</option>
            <option value="price-high" ${this.state.sort === "price-high" ? "selected" : ""}>Price: high to low</option>
            <option value="name" ${this.state.sort === "name" ? "selected" : ""}>Name</option>
          </select>
        </div>

        <details class="mobile-filters">
          <summary>Filters <span>+</span></summary>
          ${filters}
        </details>

        <div class="catalog-layout">
          ${filters}
          <div class="products-grid">${this.renderCards(filtered)}</div>
        </div>
      </section>`;

    this.bindEvents();
  }

  bindEvents() {
    this.shadowRoot.querySelector(".hero-cta")?.addEventListener("click", () => {
      this.shadowRoot.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth" });
      sendAction(this, "shop");
    });

    this.shadowRoot.querySelector(".sort")?.addEventListener("change", (event) => {
      this.state.sort = event.target.value;
      this.render();
    });

    this.shadowRoot.querySelectorAll("[data-filter]").forEach((control) => {
      control.addEventListener("change", (event) => {
        const input = event.currentTarget;
        const type = input.dataset.filter;
        if (type === "category" || type === "size" || type === "colour") {
          const collection = type === "category" ? this.state.categories :
            type === "size" ? this.state.sizes : this.state.colours;
          input.checked ? collection.add(input.value) : collection.delete(input.value);
        }
        if (type === "min-price") this.state.minPrice = input.value;
        if (type === "max-price") this.state.maxPrice = input.value;
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll("[data-wishlist]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const productId = event.currentTarget.dataset.wishlist;
        this.state.wishlist.has(productId) ? this.state.wishlist.delete(productId) : this.state.wishlist.add(productId);
        sendAction(this, "wishlist", { productId, saved: this.state.wishlist.has(productId) });
        this.render();
      });
    });

    this.shadowRoot.querySelectorAll(".product-card").forEach((card) => {
      const open = () => sendAction(this, "product", {
        productId: card.dataset.productId,
        url: card.dataset.url
      });
      card.addEventListener("click", open);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }
}

if (!customElements.get("store-header")) customElements.define("store-header", StoreHeader);
if (!customElements.get("store-landing")) customElements.define("store-landing", StoreLanding);

