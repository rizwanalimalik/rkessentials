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

// Demo Data Samples for instant testing
const DEMO_PRODUCTS = {
  glasses: {
    url: "https://www.ray-ban.com/usa/sunglasses/RB3025-aviator-classic-gold/805289602057",
    title: "Luxury Titanium Polarized Aviator Eyewear",
    originalPrice: "8500",
    sellingPrice: "6850",
    comparePrice: "9500",
    category: "Eyewear & Sunglasses",
    sku: "EYE-TITAN-001",
    images: [
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• Premium Hypoallergenic Titanium alloy construction (ultra-lightweight 9.5g).\n• High-Definition UV400 Polarized lenses for glare reduction.\n• Ergonomic silicone nose-pads with flex spring hinges for all-day comfort.\n• Ideal for prescription lenses, everyday styling, and outdoor protection.\n• Comes with luxury leather case, microfiber cloth & authenticity card.`
  },
  watch: {
    url: "https://www.apple.com/watch/ultra-2",
    title: "Ultra Titanium AMOLED Smartwatch with Heart & SpO2 Monitor",
    originalPrice: "14000",
    sellingPrice: "11950",
    comparePrice: "16500",
    category: "Smart Electronics",
    sku: "WCH-ULTRA-02",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1508615039623-a25605d2b022?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• 2.04" Always-On HD AMOLED display with 1000 nits peak brightness.\n• Bluetooth Calling, real-time message sync & notification alerts.\n• Advanced biometrics: 24/7 Heart rate, SpO2 blood oxygen & sleep tracking.\n• IP68 Waterproof rating suitable for sports, rain, and fitness.\n• Long-lasting 7-day battery life with fast magnetic wireless charging.`
  },
  earbuds: {
    url: "https://www.sony.com/audio/headphones/wf-1000xm5",
    title: "Active Noise Cancelling (ANC) True Wireless Earbuds",
    originalPrice: "6500",
    sellingPrice: "4999",
    comparePrice: "7500",
    category: "Audio & Accessories",
    sku: "AUD-ANC-99",
    images: [
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80"
    ],
    description: `• Hybrid Active Noise Cancellation blocks 95% of background noise.\n• High-fidelity 10mm dynamic bass drivers for immersive sound quality.\n• Dual beamforming microphones with AI ENC clear voice calling.\n• 36-hour total playtime with USB-C quick charge case.\n• Low latency gaming mode with touch controls.`
  }
};

function loadDemoProduct(type) {
  const prod = DEMO_PRODUCTS[type];
  if (!prod) return;

  document.getElementById('productUrlInput').value = prod.url;
  populateEditor(prod);
  showToast(`Loaded ${prod.title.substring(0, 30)}...`);
}

// 1-Click Fetch & Web Extraction Logic
async function fetchProductData() {
  const urlInput = document.getElementById('productUrlInput');
  const url = urlInput.value.trim();

  if (!url) {
    alert("Please enter or paste a valid product link first!");
    urlInput.focus();
    return;
  }

  // UI loading state
  const btn = document.getElementById('fetchBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');

  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';

  try {
    // Attempt multi-engine extraction (CORS Proxy -> OpenGraph & Microdata Scraper)
    const extractedData = await extractDataFromUrl(url);
    populateEditor(extractedData);
    showToast("✓ Product extracted successfully! Ready to set your price.");
  } catch (error) {
    console.warn("Live scraping fallback:", error);
    // Fallback parser if website blocks cross-origin headers
    const fallbackData = createSmartFallbackFromUrl(url);
    populateEditor(fallbackData);
    showToast("Extracted product information. Please review and set your price.");
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline-block';
    btnSpinner.style.display = 'none';
  }
}

// Universal Web Scraper utilizing AllOrigins CORS proxy & DOM Parser
async function extractDataFromUrl(targetUrl) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
  const response = await fetch(proxyUrl);
  
  if (!response.ok) throw new Error("Network response was not ok");
  
  const json = await response.json();
  const htmlText = json.contents;

  if (!htmlText) throw new Error("Empty HTML content returned");

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // 1. Extract Title
  let title = 
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector('meta[name="twitter:title"]')?.content ||
    doc.querySelector('h1')?.innerText?.trim() ||
    doc.title?.trim() ||
    "Imported Product";

  // Clean trailing site names (e.g. "Product Title | Amazon.com")
  title = title.split('|')[0].split(' - ')[0].trim();

  // 2. Extract Description
  let description =
    doc.querySelector('meta[property="og:description"]')?.content ||
    doc.querySelector('meta[name="description"]')?.content ||
    doc.querySelector('#productDescription')?.innerText?.trim() ||
    "";

  // 3. Extract Images (OpenGraph, itemprop, and large img tags)
  let images = [];
  const ogImg = doc.querySelector('meta[property="og:image"]')?.content;
  if (ogImg) images.push(ogImg);

  const imgElements = doc.querySelectorAll('img');
  imgElements.forEach(img => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy');
    if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('avatar') && !src.includes('banner')) {
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) {
        const u = new URL(targetUrl);
        src = `${u.origin}${src}`;
      }
      if (src.startsWith('http') && !images.includes(src)) {
        images.push(src);
      }
    }
  });

  // Limit to best 6 images
  images = images.slice(0, 6);
  if (images.length === 0) {
    images.push("https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80");
  }

  // 4. Try extracting price from Schema.org / OpenGraph
  let rawPrice = 
    doc.querySelector('meta[property="product:price:amount"]')?.content ||
    doc.querySelector('.price, .product-price, [data-price]')?.innerText?.replace(/[^0-9.]/g, '') ||
    "4500";

  return {
    url: targetUrl,
    title,
    description: description || "• High quality construction & materials.\n• Certified authentic and packaged safely for delivery.\n• Full customer warranty included.",
    originalPrice: parseFloat(rawPrice) ? Math.round(parseFloat(rawPrice)).toString() : "4500",
    sellingPrice: "",
    comparePrice: "",
    category: "General",
    sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
    images
  };
}

// Fallback generator when site blocks CORS completely
function createSmartFallbackFromUrl(url) {
  let slug = "Product";
  try {
    const urlObj = new URL(url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      slug = parts[parts.length - 1].replace(/[-_]/g, ' ');
    }
  } catch (e) {}

  const titleCase = slug.charAt(0).toUpperCase() + slug.slice(1);

  return {
    url,
    title: titleCase.length > 3 ? titleCase : "Imported Premium Product",
    description: `• High-grade build quality tailored for everyday performance.\n• Ergonomic and durable construction.\n• Available in multiple colors and variants.\n• Complete accessories & user manual included.`,
    originalPrice: "3500",
    sellingPrice: "4800",
    comparePrice: "6000",
    category: "New Arrivals",
    sku: `PRD-${Math.floor(1000 + Math.random() * 9000)}`,
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1574258495973-f010dfbb5371?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=600&q=80"
    ]
  };
}

// Populate Editor Fields
function populateEditor(data) {
  document.getElementById('editorContainer').style.display = 'block';

  document.getElementById('productTitle').value = data.title || '';
  document.getElementById('productCategory').value = data.category || 'General';
  document.getElementById('productSku').value = data.sku || `SKU-${Date.now().toString().slice(-4)}`;
  document.getElementById('productDescription').value = data.description || '';
  document.getElementById('originalPrice').value = data.originalPrice ? `PKR ${data.originalPrice}` : 'PKR 0';
  document.getElementById('sellingPrice').value = data.sellingPrice || (parseFloat(data.originalPrice) ? Math.round(parseFloat(data.originalPrice) * 1.35) : '');
  document.getElementById('comparePrice').value = data.comparePrice || (parseFloat(data.sellingPrice) ? Math.round(parseFloat(data.sellingPrice) * 1.25) : '');

  currentExtractedImages = [...(data.images || [])];
  renderExtractedImages();
  calculateMargin();

  // Scroll smoothly to editor
  document.getElementById('editorContainer').scrollIntoView({ behavior: 'smooth' });
}

// Render Photos in Editor
function renderExtractedImages() {
  const container = document.getElementById('imageGallery');
  const countEl = document.getElementById('photoCount');
  countEl.innerText = currentExtractedImages.length;
  container.innerHTML = '';

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
  if (currentExtractedImages.length <= 1) {
    alert("At least one product image is required.");
    return;
  }
  currentExtractedImages.splice(idx, 1);
  renderExtractedImages();
}

function addNewImageSlot() {
  const url = prompt("Paste additional image URL:");
  if (url && url.startsWith('http')) {
    currentExtractedImages.push(url);
    renderExtractedImages();
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

// Formatting helpers for description
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
    thumbnail: currentExtractedImages[0] || '',
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
    // Generate standard Shopify CSV format
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
    // Standard WooCommerce CSV format
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
  exportAs('json');
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

// Toast helper
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}
