// State management
let currentExtractedImages = [];
let savedProducts = [];

const LOCAL_STORAGE_KEY = 'quicklist_products_catalog';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (cached) {
    try {
      savedProducts = JSON.parse(cached);
      renderCatalog();
    } catch (e) {
      console.error(e);
    }
  }
});

// Demo Data Samples
const DEMO_PRODUCTS = {
  glasses: {
    url: "https://www.example.com/products/titanium-aviator-sunglasses",
    title: "Luxury Titanium Polarized Aviator Eyewear",
    originalPrice: "8500",
    sellingPrice: "6850",
    comparePrice: "9500",
    category: "Eyewear & Sunglasses",
    sku: "EYE-TITAN-001",
    images: [
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• Premium Hypoallergenic Titanium alloy construction.\n• High-Definition UV400 Polarized lenses.\n• Ergonomic flex spring hinges for all-day comfort.`
  },
  watch: {
    url: "https://www.example.com/products/ultra-amoled-smartwatch",
    title: "Ultra Titanium AMOLED Smartwatch with Heart & SpO2 Monitor",
    originalPrice: "14000",
    sellingPrice: "11950",
    comparePrice: "16500",
    category: "Smart Electronics",
    sku: "WCH-ULTRA-02",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• 2.04" Always-On HD AMOLED display.\n• Bluetooth Calling & real-time notification alerts.\n• 24/7 Heart rate, SpO2 blood oxygen & sleep tracking.`
  },
  earbuds: {
    url: "https://www.example.com/products/anc-true-wireless-earbuds",
    title: "Active Noise Cancelling (ANC) True Wireless Earbuds",
    originalPrice: "6500",
    sellingPrice: "4999",
    comparePrice: "7500",
    category: "Audio & Accessories",
    sku: "AUD-ANC-99",
    images: [
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• Hybrid Active Noise Cancellation.\n• High-fidelity 10mm dynamic bass drivers.\n• 36-hour total playtime with USB-C quick charge.`
  }
};

function loadDemoProduct(type) {
  const prod = DEMO_PRODUCTS[type];
  if (!prod) return;
  document.getElementById('productUrlInput').value = prod.url;
  populateEditor(prod);
  showToast(`Loaded ${prod.title.substring(0, 30)}...`);
}

// Multi-Proxy Scraper List (To guarantee reliable HTML extraction from external sites)
const PROXIES = [
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
];

async function fetchHtmlWithFallback(targetUrl) {
  let lastError = null;

  // Try Proxy 1 (AllOrigins JSON format)
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents && data.contents.length > 100) {
        return data.contents;
      }
    }
  } catch (e) {
    lastError = e;
  }

  // Try Proxy 2 (corsproxy.io direct HTML)
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      if (html && html.length > 100) return html;
    }
  } catch (e) {
    lastError = e;
  }

  // Try Proxy 3 (codetabs)
  try {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      if (html && html.length > 100) return html;
    }
  } catch (e) {
    lastError = e;
  }

  throw lastError || new Error("Unable to bypass cross-origin security for this target link");
}

// Main 1-Click Fetch Handler
async function fetchProductData() {
  const urlInput = document.getElementById('productUrlInput');
  const url = urlInput.value.trim();

  if (!url) {
    alert("Please enter or paste a valid product link first!");
    urlInput.focus();
    return;
  }

  const btn = document.getElementById('fetchBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');

  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';

  try {
    const htmlText = await fetchHtmlWithFallback(url);
    const parsedData = parseProductHtml(htmlText, url);
    populateEditor(parsedData);
    showToast("✓ Product photos, title & details extracted from your link!");
  } catch (err) {
    console.warn("Live scraping encountered block. Falling back to URL pattern parser:", err);
    // Parse directly from URL slug + allow user instant manual image pasting if site blocks all public proxies (e.g. Cloudflare / Daraz anti-bot)
    const urlData = parseDataFromUrlPattern(url);
    populateEditor(urlData);
    showToast("Extracted title from link. Set your price and review details!");
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline-block';
    btnSpinner.style.display = 'none';
  }
}

// Parser for HTML content
function parseProductHtml(htmlText, targetUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // 1. Title Extraction
  let title = 
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector('meta[name="twitter:title"]')?.content ||
    doc.querySelector('h1')?.innerText?.trim() ||
    doc.title?.trim() ||
    "";

  // Clean trailing branding
  if (title) {
    title = title.split('|')[0].split(' - ')[0].trim();
  } else {
    title = parseSlugFromUrl(targetUrl);
  }

  // 2. Description Extraction
  let description =
    doc.querySelector('meta[property="og:description"]')?.content ||
    doc.querySelector('meta[name="description"]')?.content ||
    doc.querySelector('#productDescription')?.innerText?.trim() ||
    doc.querySelector('.product-description')?.innerText?.trim() ||
    "";

  // 3. Images Extraction
  let images = [];
  
  // High quality meta og:image
  const ogImg = doc.querySelector('meta[property="og:image"]')?.content;
  if (ogImg && isValidImageUrl(ogImg)) images.push(resolveUrl(ogImg, targetUrl));

  const twitterImg = doc.querySelector('meta[name="twitter:image"]')?.content;
  if (twitterImg && isValidImageUrl(twitterImg) && !images.includes(twitterImg)) {
    images.push(resolveUrl(twitterImg, targetUrl));
  }

  // Scan img tags for actual product images
  const imgElements = doc.querySelectorAll('img');
  imgElements.forEach(img => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-zoom-image');
    if (src && isValidImageUrl(src)) {
      src = resolveUrl(src, targetUrl);
      if (!images.includes(src)) {
        images.push(src);
      }
    }
  });

  // Keep top 6 images
  images = images.slice(0, 6);

  // 4. Price Detection
  let rawPrice = 
    doc.querySelector('meta[property="product:price:amount"]')?.content ||
    doc.querySelector('.price, .product-price, .pdp-price, [data-price]')?.innerText?.replace(/[^0-9.]/g, '') ||
    "";

  return {
    url: targetUrl,
    title: title || "Imported Product",
    description: description || "• Premium quality material and durable craftsmanship.\n• 100% authentic with manufacturer warranty.\n• Fast nationwide delivery with secure packaging.",
    originalPrice: parseFloat(rawPrice) ? Math.round(parseFloat(rawPrice)).toString() : "",
    sellingPrice: "",
    comparePrice: "",
    category: detectCategoryFromText(title + " " + targetUrl),
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images: images
  };
}

function isValidImageUrl(src) {
  if (!src) return false;
  const s = src.toLowerCase();
  const badWords = ['logo', 'icon', 'banner', 'avatar', 'payment', 'sprite', 'star', 'badge', 'loader'];
  for (let w of badWords) {
    if (s.includes(w)) return false;
  }
  return true;
}

function resolveUrl(src, baseUrl) {
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) {
    try {
      const u = new URL(baseUrl);
      return `${u.origin}${src}`;
    } catch (e) {
      return src;
    }
  }
  return src;
}

function parseSlugFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(p => p.length > 0 && !p.includes('html') && !p.includes('product'));
    if (parts.length > 0) {
      const last = parts[parts.length - 1].replace(/[-_+]/g, ' ').replace(/\.html?/g, '');
      return last.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  } catch (e) {}
  return "Imported Product";
}

function detectCategoryFromText(text) {
  const t = text.toLowerCase();
  if (t.includes('shoe') || t.includes('sneaker') || t.includes('boot')) return "Footwear";
  if (t.includes('shirt') || t.includes('dress') || t.includes('jacket') || t.includes('pant') || t.includes('cloth')) return "Apparel & Fashion";
  if (t.includes('phone') || t.includes('watch') || t.includes('headphone') || t.includes('earbud') || t.includes('laptop') || t.includes('cable')) return "Electronics & Gadgets";
  if (t.includes('glass') || t.includes('frame') || t.includes('optic') || t.includes('lens')) return "Eyewear";
  if (t.includes('bag') || t.includes('wallet') || t.includes('purse')) return "Bags & Accessories";
  if (t.includes('cream') || t.includes('perfume') || t.includes('serum') || t.includes('makeup')) return "Beauty & Cosmetics";
  return "General";
}

function parseDataFromUrlPattern(url) {
  const title = parseSlugFromUrl(url);
  const cat = detectCategoryFromText(url);

  return {
    url,
    title,
    description: `• High-grade build quality and reliable performance.\n• Tested for durability and everyday use.\n• Complete packaging with user manual & accessories included.\n• 7-day replacement warranty.`,
    originalPrice: "",
    sellingPrice: "",
    comparePrice: "",
    category: cat,
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images: [] // Empty so it prompts user to paste image if not scraped
  };
}

// Populate Editor Fields
function populateEditor(data) {
  document.getElementById('editorContainer').style.display = 'block';

  document.getElementById('productTitle').value = data.title || '';
  document.getElementById('productCategory').value = data.category || 'General';
  document.getElementById('productSku').value = data.sku || `SKU-${Date.now().toString().slice(-4)}`;
  document.getElementById('productDescription').value = data.description || '';
  
  if (data.originalPrice) {
    document.getElementById('originalPrice').value = `PKR ${data.originalPrice}`;
    document.getElementById('sellingPrice').value = Math.round(parseFloat(data.originalPrice) * 1.35);
  } else {
    document.getElementById('originalPrice').value = 'Not detected';
    document.getElementById('sellingPrice').value = '';
  }

  document.getElementById('comparePrice').value = data.comparePrice || '';

  currentExtractedImages = [...(data.images || [])];
  renderExtractedImages();
  calculateMargin();

  document.getElementById('editorContainer').scrollIntoView({ behavior: 'smooth' });
}

// Render Photos in Editor
function renderExtractedImages() {
  const container = document.getElementById('imageGallery');
  const countEl = document.getElementById('photoCount');
  countEl.innerText = currentExtractedImages.length;
  container.innerHTML = '';

  if (currentExtractedImages.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 4; padding: 20px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 8px; text-align: center;">
        <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;"><i class="fa-solid fa-image"></i> No direct photos were exposed by this website's security.</p>
        <button type="button" class="btn btn-primary-sm" onclick="addNewImageSlot()"><i class="fa-solid fa-plus"></i> Paste Photo Link or Image URL</button>
      </div>
    `;
    return;
  }

  currentExtractedImages.forEach((imgUrl, idx) => {
    const card = document.createElement('div');
    card.className = `image-thumb-card ${idx === 0 ? 'primary' : ''}`;
    card.innerHTML = `
      <img src="${imgUrl}" alt="Product Photo ${idx + 1}" onerror="this.src='https://via.placeholder.com/150?text=Image+Load+Error'">
      <div class="thumb-actions">
        <button type="button" class="thumb-btn" onclick="setPrimaryImage(${idx})" title="Set as Main Thumbnail"><i class="fa-solid fa-star"></i></button>
        <button type="button" class="thumb-btn" onclick="removeImage(${idx})" title="Delete image"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${idx === 0 ? '<span class="primary-badge">Cover</span>' : ''}
    `;
    container.appendChild(card);
  });
}

function setPrimaryImage(idx) {
  const selected = currentExtractedImages.splice(idx, 1)[0];
  currentExtractedImages.unshift(selected);
  renderExtractedImages();
  showToast("Main cover photo updated");
}

function removeImage(idx) {
  currentExtractedImages.splice(idx, 1);
  renderExtractedImages();
}

function addNewImageSlot() {
  const url = prompt("Paste Product Image URL (right-click on product photo > Copy image address):");
  if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
    currentExtractedImages.push(url.trim());
    renderExtractedImages();
    showToast("Photo added successfully!");
  }
}

// Calculate Profit Margin
function calculateMargin() {
  const origStr = document.getElementById('originalPrice').value.replace(/[^0-9.]/g, '');
  const sellStr = document.getElementById('sellingPrice').value.replace(/[^0-9.]/g, '');
  const marginDisplay = document.getElementById('marginDisplay');

  const orig = parseFloat(origStr) || 0;
  const sell = parseFloat(sellStr) || 0;

  if (sell > 0 && orig > 0) {
    const profit = sell - orig;
    const percentage = Math.round((profit / sell) * 100);
    marginDisplay.innerHTML = `<span style="color: ${profit >= 0 ? '#10b981' : '#ef4444'}">
      PKR ${profit.toLocaleString()} profit (${percentage}%)
    </span>`;
  } else if (sell > 0) {
    marginDisplay.innerHTML = `PKR ${sell.toLocaleString()} selling price`;
  } else {
    marginDisplay.innerHTML = `Set selling price`;
  }
}

// Description formatting
function formatDesc(action) {
  const descEl = document.getElementById('productDescription');
  if (action === 'bullet') {
    const lines = descEl.value.split('\n').filter(l => l.trim().length > 0);
    descEl.value = lines.map(l => l.startsWith('•') ? l : `• ${l.trim()}`).join('\n');
  } else if (action === 'highlight') {
    descEl.value = `KEY HIGHLIGHTS:\n• High quality materials and durable design.\n• Fast nationwide delivery across Pakistan.\n• Satisfaction guaranteed.\n\n` + descEl.value;
  } else if (action === 'clear') {
    if (confirm("Clear description box?")) descEl.value = '';
  }
}

// Publish Product to Store Catalog
function publishProductToStore() {
  const title = document.getElementById('productTitle').value.trim();
  const sellingPrice = document.getElementById('sellingPrice').value.trim();
  const comparePrice = document.getElementById('comparePrice').value.trim();
  const category = document.getElementById('productCategory').value.trim() || 'General';
  const sku = document.getElementById('productSku').value.trim();
  const description = document.getElementById('productDescription').value.trim();
  const sourceUrl = document.getElementById('productUrlInput').value.trim();

  if (!title) {
    alert("Please enter a product title!");
    return;
  }
  if (!sellingPrice) {
    alert("Please decide and enter your Selling Price!");
    document.getElementById('sellingPrice').focus();
    return;
  }

  const newProduct = {
    id: `PRD-${Date.now()}`,
    title,
    price: sellingPrice,
    comparePrice: comparePrice || null,
    category,
    sku,
    description,
    images: [...currentExtractedImages],
    thumbnail: currentExtractedImages[0] || 'https://via.placeholder.com/150?text=Product+Image',
    sourceUrl,
    dateAdded: new Date().toLocaleDateString()
  };

  savedProducts.unshift(newProduct);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProducts));

  renderCatalog();
  showToast(`🎉 "${title}" uploaded to your store catalog!`);
  resetEditor();
}

function resetEditor() {
  document.getElementById('editorContainer').style.display = 'none';
  document.getElementById('productUrlInput').value = '';
  currentExtractedImages = [];
}

// Render Saved Catalog
function renderCatalog() {
  const container = document.getElementById('catalogList');
  const emptyState = document.getElementById('emptyState');
  const countBadge = document.getElementById('savedCount');

  countBadge.innerText = savedProducts.length;

  if (savedProducts.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyState);
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  container.innerHTML = '';

  savedProducts.forEach((prod, index) => {
    const card = document.createElement('div');
    card.className = 'uploaded-card';
    card.innerHTML = `
      <div class="card-img-wrap">
        <img src="${prod.thumbnail}" alt="${prod.title}" onerror="this.src='https://via.placeholder.com/75?text=No+Img'">
      </div>
      <div class="card-info">
        <span class="card-cat">${prod.category} • ${prod.images.length} photos</span>
        <h5>${prod.title}</h5>
        <div class="card-price-row">
          <span class="card-price">PKR ${parseFloat(prod.price).toLocaleString()}</span>
          ${prod.comparePrice ? `<span class="card-old-price">PKR ${parseFloat(prod.comparePrice).toLocaleString()}</span>` : ''}
        </div>
      </div>
      <button class="btn-delete-uploaded" onclick="deleteProduct(${index})" title="Remove"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(card);
  });
}

function deleteProduct(index) {
  if (confirm("Remove this product from your store catalog?")) {
    savedProducts.splice(index, 1);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProducts));
    renderCatalog();
    showToast("Product removed from catalog");
  }
}

function clearCatalog() {
  if (savedProducts.length === 0) return;
  if (confirm("Clear all products from your catalog?")) {
    savedProducts = [];
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    renderCatalog();
    showToast("Catalog cleared");
  }
}

// Export Catalog Formats (Shopify, WooCommerce, JSON)
function exportAs(type) {
  if (savedProducts.length === 0) {
    alert("No products in catalog to export! Please add a product first.");
    return;
  }

  if (type === 'json') {
    downloadFile(JSON.stringify(savedProducts, null, 2), 'products-catalog.json', 'application/json');
    showToast("Exported catalog as JSON!");
  } else if (type === 'shopify') {
    let csv = "Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Variant SKU,Variant Price,Variant Compare At Price,Image Src,Image Position\n";
    savedProducts.forEach(p => {
      const handle = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const descHtml = `"${p.description.replace(/\n/g, '<br>').replace(/"/g, '""')}"`;
      const titleEsc = `"${p.title.replace(/"/g, '""')}"`;
      csv += `${handle},${titleEsc},${descHtml},MyStore,${p.category},Imported,TRUE,${p.sku},${p.price},${p.comparePrice || ''},${p.thumbnail || ''},1\n`;
    });
    downloadFile(csv, 'shopify-products-import.csv', 'text/csv');
    showToast("Exported Shopify-ready CSV!");
  } else if (type === 'woocommerce') {
    let csv = "Type,SKU,Name,Published,Is featured?,Visibility in catalog,Short description,Description,Regular price,Sale price,Categories,Images\n";
    savedProducts.forEach(p => {
      const nameEsc = `"${p.title.replace(/"/g, '""')}"`;
      const descEsc = `"${p.description.replace(/"/g, '""')}"`;
      const imgList = p.images.join(', ');
      csv += `simple,${p.sku},${nameEsc},1,0,visible,,${descEsc},${p.comparePrice || p.price},${p.comparePrice ? p.price : ''},"${p.category}","${imgList}"\n`;
    });
    downloadFile(csv, 'woocommerce-products-import.csv', 'text/csv');
    showToast("Exported WooCommerce-ready CSV!");
  }
}

function exportStoreData() {
  exportAs('woocommerce');
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}
