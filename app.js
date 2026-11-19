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

// Universal High-Reliability Scraper
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
  statusBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Contacting website server and fetching images, description & price...';

  try {
    const data = await extractProductWithCloudEngine(url);
    statusBox.className = 'scrape-status success';
    statusBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Extracted successfully! Review photos and set your selling price.';
    populateEditor(data);
    showToast("✓ Product extracted! Decide your selling price.");
  } catch (err) {
    console.error("Scraping error:", err);
    // Fallback parser directly from URL structure
    const fallback = parseDirectlyFromUrl(url);
    statusBox.className = 'scrape-status warning';
    statusBox.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Network timed out on this link. Title auto-extracted from link. You can add image links below or switch to <strong>Mode 2</strong>.';
    populateEditor(fallback);
    showToast("Review product details and set price.");
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline-block';
    btnSpinner.style.display = 'none';
  }
}

// Production Cloud Scraper Engine
async function extractProductWithCloudEngine(targetUrl) {
  // Query with customized selector rules for e-commerce stores (Naheed, Daraz, Shopify, Magento, WooCommerce)
  const apiEndpoint = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}` + 
    `&data.price.selector=.price%2C%20.product-price%2C%20.pdp-price%2C%20[data-price]&data.price.type=text` +
    `&data.images.selectorAll=img&data.images.attr=src`;

  const response = await fetch(apiEndpoint, { signal: AbortSignal.timeout(18000) });
  
  if (!response.ok) {
    throw new Error(`API response failed with status ${response.status}`);
  }

  const json = await response.json();
  if (json.status !== 'success' || !json.data) {
    throw new Error("Invalid scraper response");
  }

  const d = json.data;

  // 1. Title
  let title = d.title || parseSlugFromUrl(targetUrl);
  title = title.split('|')[0].split(' - ')[0].trim();

  // 2. Description
  let desc = d.description || '';
  if (desc.includes('Product Highlights:')) {
    desc = desc.replace('Product Highlights:', 'Product Highlights:\n• ').replace(/([a-z])([A-Z])/g, '$1\n• $2');
  }

  // 3. Price
  let rawPrice = '';
  if (d.price) {
    rawPrice = d.price.replace(/[^0-9]/g, '');
  }

  // 4. Photos Filtering (High resolution product gallery images)
  let cleanImages = [];

  if (d.images && Array.isArray(d.images)) {
    d.images.forEach(imgUrl => {
      if (typeof imgUrl === 'string' && isProductImage(imgUrl)) {
        let clean = imgUrl.startsWith('//') ? 'https:' + imgUrl : imgUrl;
        if (!cleanImages.includes(clean)) {
          cleanImages.push(clean);
        }
      }
    });
  }

  // If specific catalog images not matched, check og:image
  if (cleanImages.length === 0 && d.image && d.image.url && !d.image.url.includes('placeholder')) {
    cleanImages.push(d.image.url);
  }

  // Deduplicate and limit to 6 images
  cleanImages = cleanImages.slice(0, 6);

  return {
    url: targetUrl,
    title,
    description: desc || "• High quality construction & materials.\n• Designed for comfort and durability.\n• Authentic packaging and fast delivery.",
    originalPrice: rawPrice,
    sellingPrice: rawPrice ? Math.round(parseFloat(rawPrice) * 1.25).toString() : '',
    comparePrice: rawPrice ? rawPrice : '',
    category: detectCategory(title + ' ' + targetUrl),
    sku: `SKU-${Date.now().toString().slice(-5)}`,
    images: cleanImages
  };
}

function isProductImage(url) {
  const s = url.toLowerCase();
  // Filter out UI elements, logos, icons
  if (s.includes('logo') || s.includes('icon') || s.includes('placeholder') || 
      s.includes('ellipsis') || s.includes('close') || s.includes('loader') || 
      s.includes('banner') || s.includes('avatar') || s.includes('payment') || 
      s.includes('search') || s.includes('user') || s.includes('cart') || s.endsWith('.svg') || s.endsWith('.gif')) {
    return false;
  }
  // Must be an actual product picture
  return s.includes('product') || s.includes('catalog') || s.includes('media') || s.includes('images') || s.includes('uploads');
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
  if (t.includes('bag') || t.includes('handbag') || t.includes('wallet') || t.includes('purse')) return "Bags & Handbags";
  if (t.includes('shoe') || t.includes('sneaker') || t.includes('sandal') || t.includes('heel')) return "Footwear";
  if (t.includes('shirt') || t.includes('dress') || t.includes('kurti') || t.includes('suit') || t.includes('jacket')) return "Women's Fashion";
  if (t.includes('phone') || t.includes('watch') || t.includes('earbud') || t.includes('headphone') || t.includes('charger')) return "Electronics";
  if (t.includes('glass') || t.includes('frame') || t.includes('optic')) return "Eyewear";
  if (t.includes('beauty') || t.includes('serum') || t.includes('cream') || t.includes('makeup')) return "Beauty & Cosmetics";
  return "General";
}

function parseDirectlyFromUrl(url) {
  const title = parseSlugFromUrl(url);
  return {
    url,
    title,
    description: "• High quality materials and modern design.\n• Suitable for daily use and special occasions.\n• Secure delivery across Pakistan.",
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
    document.getElementById('originalPrice').value = `Rs. ${parseFloat(data.originalPrice).toLocaleString()}`;
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
