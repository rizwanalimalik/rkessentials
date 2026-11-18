// State management
let currentExtractedImages = [];
let savedProducts = [];

const LOCAL_STORAGE_KEY = 'quicklist_products_catalog';

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

function switchInputMode(mode) {
  const tabAuto = document.getElementById('tabAuto');
  const tabFast = document.getElementById('tabFast');
  const autoContent = document.getElementById('modeAutoContent');
  const fastContent = document.getElementById('modeFastContent');

  if (mode === 'auto') {
    tabAuto.classList.add('active');
    tabFast.classList.remove('active');
    autoContent.style.display = 'block';
    fastContent.style.display = 'none';
  } else {
    tabFast.classList.add('active');
    tabAuto.classList.remove('active');
    fastContent.style.display = 'block';
    autoContent.style.display = 'none';
  }
}

// Multi-engine web scraper
async function fetchProductData() {
  const urlInput = document.getElementById('productUrlInput');
  const url = urlInput.value.trim();
  const statusBox = document.getElementById('scrapeStatusBox');

  if (!url) {
    alert("Please enter or paste a valid product link!");
    urlInput.focus();
    return;
  }

  const btn = document.getElementById('fetchBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');

  btn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline-block';
  statusBox.style.display = 'block';
  statusBox.className = 'scrape-status info';
  statusBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Contacting website server and extracting product media...';

  // 1. First priority: Try Local Scraper Engine (Bypasses 100% of blocks, Cloudflare & CORS)
  try {
    const localRes = await fetch(`http://localhost:5000/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) });
    if (localRes.ok) {
      const localData = await localRes.json();
      if (localData && localData.success && localData.title) {
        statusBox.className = 'scrape-status success';
        statusBox.innerHTML = '<i class="fa-solid fa-bolt"></i> Extracted via Local Engine! Photos, title & specs ready.';
        
        // Clean naheed/magento prices if has leading dot
        let cleanPrice = localData.price ? localData.price.replace(/^\./, '').replace(/[^0-9]/g, '') : '';
        
        populateEditor({
          url: localData.url,
          title: localData.title,
          description: localData.description || '• Premium quality craftsmanship.\n• Authentic product with manufacturer warranty.\n• Fast nationwide delivery.',
          originalPrice: cleanPrice,
          sellingPrice: cleanPrice ? Math.round(parseFloat(cleanPrice) * 1.25).toString() : '',
          comparePrice: cleanPrice ? cleanPrice : '',
          category: detectCategory(localData.title + ' ' + url),
          sku: `SKU-${Date.now().toString().slice(-5)}`,
          images: (localData.images || []).filter(img => !img.includes('placeholder') && !img.includes('ellipsis') && !img.includes('close'))
        });
        showToast("✓ Product extracted! Decide your selling price.");
        return;
      }
    }
  } catch (localErr) {
    console.log("Local engine check:", localErr.message);
  }

  // 2. Second priority: Public Web Proxies
  try {
    const htmlText = await fetchHtmlThroughProxies(url);
    const parsedData = parseHtmlContent(htmlText, url);

    statusBox.className = 'scrape-status success';
    statusBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Scraped successfully! Review details and decide your selling price.';
    populateEditor(parsedData);
    showToast("Product extracted! Set your price.");
  } catch (err) {
    console.warn("Proxy scraping error:", err);
    // Parse from URL structure directly
    const urlData = parseDirectlyFromUrl(url);
    statusBox.className = 'scrape-status warning';
    statusBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Tip: Start <strong>start_engine.bat</strong> in the project folder to auto-extract from heavily protected sites like Naheed / Daraz without any blocks!';
    populateEditor(urlData);
    showToast("Title extracted. Review and set your price.");
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline-block';
    btnSpinner.style.display = 'none';
  }
}

async function fetchHtmlThroughProxies(targetUrl) {
  // Proxy 1: CodeTabs
  try {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      if (html && html.length > 300) return html;
    }
  } catch (e) {}

  // Proxy 2: AllOrigins
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.contents && data.contents.length > 300) return data.contents;
    }
  } catch (e) {}

  // Proxy 3: Corsproxy
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      if (html && html.length > 300) return html;
    }
  } catch (e) {}

  throw new Error("Target site blocked public proxy scrapers.");
}

function parseHtmlContent(htmlText, targetUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // Title
  let title = 
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector('meta[name="twitter:title"]')?.content ||
    doc.querySelector('h1')?.innerText?.trim() ||
    doc.title?.trim() ||
    "";

  if (title) {
    title = title.split('|')[0].split(' - ')[0].split(' : ')[0].trim();
  } else {
    title = parseSlugFromUrl(targetUrl);
  }

  // Description
  let desc = 
    doc.querySelector('meta[property="og:description"]')?.content ||
    doc.querySelector('meta[name="description"]')?.content ||
    doc.querySelector('#productDescription')?.innerText?.trim() ||
    doc.querySelector('.product-description')?.innerText?.trim() ||
    "";

  // Images
  let images = [];
  const ogImg = doc.querySelector('meta[property="og:image"]')?.content;
  if (ogImg && isUsableImage(ogImg)) images.push(cleanUrl(ogImg, targetUrl));

  doc.querySelectorAll('img').forEach(img => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-zoom-image');
    if (src && isUsableImage(src)) {
      src = cleanUrl(src, targetUrl);
      if (!images.includes(src)) images.push(src);
    }
  });

  images = images.slice(0, 6);

  // Price
  let rawPrice = 
    doc.querySelector('meta[property="product:price:amount"]')?.content ||
    doc.querySelector('.price, .product-price, .pdp-price')?.innerText?.replace(/[^0-9.]/g, '') ||
    "";

  return {
    url: targetUrl,
    title: title || "Imported Product",
    description: desc || "• Premium build quality and durable materials.\n• Packaged securely for delivery.\n• Full customer warranty included.",
    originalPrice: parseFloat(rawPrice) ? Math.round(parseFloat(rawPrice)).toString() : "",
    sellingPrice: "",
    comparePrice: "",
    category: detectCategory(title + " " + targetUrl),
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images: images
  };
}

function isUsableImage(src) {
  if (!src) return false;
  const s = src.toLowerCase();
  const filter = ['logo', 'icon', 'badge', 'payment', 'loader', 'sprite', 'avatar'];
  for (let f of filter) {
    if (s.includes(f)) return false;
  }
  return true;
}

function cleanUrl(src, base) {
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) {
    try {
      const u = new URL(base);
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

function detectCategory(text) {
  const t = text.toLowerCase();
  if (t.includes('shoe') || t.includes('sneaker')) return "Footwear";
  if (t.includes('shirt') || t.includes('dress') || t.includes('jacket') || t.includes('hoodie')) return "Apparel";
  if (t.includes('phone') || t.includes('watch') || t.includes('earbud') || t.includes('headphone') || t.includes('charger')) return "Electronics";
  if (t.includes('glass') || t.includes('frame') || t.includes('optic')) return "Eyewear";
  if (t.includes('bag') || t.includes('wallet')) return "Bags & Wallets";
  if (t.includes('beauty') || t.includes('perfume') || t.includes('cream')) return "Cosmetics";
  return "General";
}

function parseDirectlyFromUrl(url) {
  const title = parseSlugFromUrl(url);
  return {
    url,
    title,
    description: "• High quality construction & materials.\n• Designed for comfort and everyday use.\n• Complete packaging with warranty.",
    originalPrice: "",
    sellingPrice: "",
    comparePrice: "",
    category: detectCategory(title + " " + url),
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images: []
  };
}

// MODE 2: Instant Parse from Pasted Text / Images
function parseRawPastedProduct() {
  const rawText = document.getElementById('rawPasteInput').value.trim();
  const rawImages = document.getElementById('rawImageInput').value.trim();

  if (!rawText && !rawImages) {
    alert("Please paste the product text or image link in the boxes above!");
    return;
  }

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let title = lines[0] || "Imported Product";
  title = title.replace(/^(product name|title|name)[\s:]+/i, '');

  let price = "";
  let descLines = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const priceMatch = line.match(/(?:price|rs|pkr|\$)\s*[:=]?\s*([0-9,.]+)/i);
    if (priceMatch && !price) {
      price = priceMatch[1].replace(/,/g, '');
    } else {
      descLines.push(line);
    }
  }

  let images = [];
  if (rawImages) {
    images = rawImages.split(',').map(s => s.trim()).filter(s => s.startsWith('http') || s.startsWith('data:'));
  }

  const data = {
    url: "Pasted Product",
    title,
    description: descLines.length > 0 ? descLines.join('\n') : "• Authentic high quality product.\n• Fast nationwide delivery.\n• Customer satisfaction guaranteed.",
    originalPrice: price || "",
    sellingPrice: price ? Math.round(parseFloat(price) * 1.25).toString() : "",
    comparePrice: "",
    category: detectCategory(title),
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images
  };

  populateEditor(data);
  showToast("✓ Product formatted into editor! Set your price.");
}

// Populate Editor Fields
function populateEditor(data) {
  document.getElementById('editorContainer').style.display = 'block';

  document.getElementById('productTitle').value = data.title || '';
  document.getElementById('productCategory').value = data.category || 'General';
  document.getElementById('productSku').value = data.sku || `SKU-${Date.now().toString().slice(-4)}`;
  document.getElementById('productDescription').value = data.description || '';
  
  if (data.originalPrice) {
    document.getElementById('originalPrice').value = data.originalPrice;
    document.getElementById('sellingPrice').value = data.sellingPrice || Math.round(parseFloat(data.originalPrice) * 1.3);
  } else {
    document.getElementById('originalPrice').value = '';
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
      <div style="grid-column: span 4; padding: 18px; background: #fff; border: 2px dashed #cbd5e1; border-radius: 8px; text-align: center;">
        <p style="color: #64748b; font-size: 0.88rem; margin-bottom: 8px;">No photos attached yet.</p>
        <button type="button" class="btn btn-primary-sm" onclick="addNewImageSlot()"><i class="fa-solid fa-plus"></i> Add Photo Link (Right click image > Copy image address)</button>
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
        <button type="button" class="thumb-btn" onclick="setPrimaryImage(${idx})" title="Set as Main WooCommerce Image"><i class="fa-solid fa-star"></i></button>
        <button type="button" class="thumb-btn" onclick="removeImage(${idx})" title="Delete image"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${idx === 0 ? '<span class="primary-badge">Featured</span>' : ''}
    `;
    container.appendChild(card);
  });
}

function setPrimaryImage(idx) {
  const selected = currentExtractedImages.splice(idx, 1)[0];
  currentExtractedImages.unshift(selected);
  renderExtractedImages();
  showToast("Featured image updated!");
}

function removeImage(idx) {
  currentExtractedImages.splice(idx, 1);
  renderExtractedImages();
}

function addNewImageSlot() {
  const url = prompt("Paste Product Image URL (right-click image on supplier site > Copy Image Address):");
  if (url && (url.startsWith('http') || url.startsWith('data:'))) {
    currentExtractedImages.push(url.trim());
    renderExtractedImages();
    showToast("Photo added!");
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

// Save Product to Queue
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
    alert("Please enter your Selling Price!");
    document.getElementById('sellingPrice').focus();
    return;
  }

  const newProduct = {
    id: `PRD-${Date.now()}`,
    title,
    price: sellingPrice,
    comparePrice: comparePrice || '',
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
  showToast(`🎉 "${title}" saved to WooCommerce export list!`);
  resetEditor();
}

function resetEditor() {
  document.getElementById('editorContainer').style.display = 'none';
  document.getElementById('productUrlInput').value = '';
  document.getElementById('rawPasteInput').value = '';
  document.getElementById('rawImageInput').value = '';
  document.getElementById('scrapeStatusBox').style.display = 'none';
  currentExtractedImages = [];
}

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
  if (confirm("Remove this product from your queue?")) {
    savedProducts.splice(index, 1);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedProducts));
    renderCatalog();
    showToast("Product removed.");
  }
}

function clearCatalog() {
  if (savedProducts.length === 0) return;
  if (confirm("Clear all products from your queue?")) {
    savedProducts = [];
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    renderCatalog();
    showToast("Queue cleared.");
  }
}

// 1-Click WooCommerce CSV Export
function exportAs(type) {
  if (savedProducts.length === 0) {
    alert("No products in queue! Please add at least one product first.");
    return;
  }

  // Exact WooCommerce product import headers
  let csv = "Type,SKU,Name,Published,Is featured?,Visibility in catalog,Short description,Description,Regular price,Sale price,Categories,Images\n";
  
  savedProducts.forEach(p => {
    const nameEsc = `"${p.title.replace(/"/g, '""')}"`;
    const descEsc = `"${p.description.replace(/\n/g, '<br>').replace(/"/g, '""')}"`;
    const imgList = p.images.join(', ');
    const regularPrice = p.comparePrice ? p.comparePrice : p.price;
    const salePrice = p.comparePrice ? p.price : '';

    csv += `simple,${p.sku},${nameEsc},1,0,visible,,${descEsc},${regularPrice},${salePrice},"${p.category}","${imgList}"\n`;
  });

  downloadFile(csv, 'woocommerce-products-import.csv', 'text/csv');
  showToast("✓ Downloaded WooCommerce-ready CSV! Ready to import.");
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
