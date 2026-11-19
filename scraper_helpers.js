// Native In-Memory Web Scraper (Bypasses CORS restrictions)
async function fetchProductDetails(targetUrl) {
  // Strategy 1: Free Open Scraper Microservice (Worker)
  const workerEndpoint = `https://api.microlink.io?url=${encodeURIComponent(targetUrl)}&palette=true`;
  try {
    const res = await fetch(workerEndpoint);
    if (res.ok) {
      const json = await res.json();
      if (json && json.status === 'success' && json.data) {
        const d = json.data;
        const images = [];
        if (d.image && d.image.url) images.push(d.image.url);
        if (d.logo && d.logo.url && !images.includes(d.logo.url)) images.push(d.logo.url);

        return {
          title: d.title || parseSlug(targetUrl),
          description: d.description || '',
          price: '',
          images: images
        };
      }
    }
  } catch (e) {
    console.warn("Worker strategy:", e);
  }

  // Strategy 2: CodeTabs Scraper
  try {
    const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      return parseRawHtml(html, targetUrl);
    }
  } catch (e) {}

  // Strategy 3: JSDelivr / AllOrigins Raw
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const html = await res.text();
      return parseRawHtml(html, targetUrl);
    }
  } catch (e) {}

  throw new Error("All public extraction gateways timed out.");
}

function parseRawHtml(html, targetUrl) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Title
  let title = 
    doc.querySelector('meta[property="og:title"]')?.content ||
    doc.querySelector('meta[name="twitter:title"]')?.content ||
    doc.querySelector('h1')?.innerText?.trim() ||
    doc.title?.trim() ||
    parseSlug(targetUrl);

  title = title.split('|')[0].split(' - ')[0].trim();

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
  if (ogImg && !ogImg.includes('placeholder')) images.push(ogImg);

  // Scan img elements
  doc.querySelectorAll('img').forEach(img => {
    let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-zoom-image');
    if (src && (src.includes('catalog/product') || src.includes('products/') || src.includes('images/'))) {
      if (!src.includes('placeholder') && !src.includes('logo') && !src.includes('icon') && !images.includes(src)) {
        if (src.startsWith('//')) src = 'https:' + src;
        images.push(src);
      }
    }
  });

  // Price
  let price = "";
  const priceEl = doc.querySelector('.price, .product-price, [data-price]');
  if (priceEl) {
    price = priceEl.innerText.replace(/[^0-9]/g, '');
  }

  return {
    title,
    description: desc,
    price,
    images: images.slice(0, 6)
  };
}

function parseSlug(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(p => p.length > 0 && !p.includes('html'));
    if (parts.length > 0) {
      return parts[parts.length - 1].replace(/[-_+]/g, ' ').replace(/\.html?/g, '').toUpperCase();
    }
  } catch (e) {}
  return "Imported Product";
}
