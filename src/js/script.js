let allProducts = [];
let activeFilter = "All";

// UI Feedback Helper
function setLoadingState(isLoading, sourceName = "") {
  const fetchBtn = document.getElementById("fetchUrlBtn");
  const fileLabel = document.getElementById("fileBtnLabel");
  const grid = document.getElementById("productsGrid");

  if (isLoading) {
    fetchBtn.disabled = true;
    fileLabel.style.pointerEvents = "none";
    fileLabel.style.opacity = "0.6";
    document.getElementById("fileName").textContent =
      `Loading: ${sourceName}...`;
    grid.innerHTML = `<div class="col-12">
      <div class="text-center py-5 bg-white rounded shadow-sm text-muted">
        <div class="spinner-border text-primary mb-3" role="status"></div>
        <h3 id="progressText">Processing Feed...</h3>
        <p class="mb-4">Downloading and parsing data. Please wait.</p>
        <div class="progress mx-auto" style="max-width: 300px; height: 12px;">
          <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" id="progressBar" style="width: 100%"></div>
        </div>
      </div>
    </div>`;
  } else {
    fetchBtn.disabled = false;
    fileLabel.style.pointerEvents = "auto";
    fileLabel.style.opacity = "1";
    if (sourceName)
      document.getElementById("fileName").textContent = sourceName;
  }
}

function updateProgress(loaded, total) {
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  if (!progressBar || !progressText) return;

  if (total && loaded <= total) {
    let percent = Math.round((loaded / total) * 100);
    percent = Math.min(100, Math.max(0, percent));
    progressBar.style.width = `${percent}%`;
    progressBar.classList.remove(
      "progress-bar-animated",
      "progress-bar-striped",
    );
    progressText.textContent = `Downloading: ${percent}%`;
  } else {
    const mb = (loaded / (1024 * 1024)).toFixed(2);
    progressText.textContent = `Downloading: ${mb} MB`;
    progressBar.style.width = "100%";
    progressBar.classList.add("progress-bar-animated", "progress-bar-striped");
  }
}

/* --- INPUT 1: LOCAL FILE UPLOAD --- */
document
  .getElementById("fileInput")
  .addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) return;

    setLoadingState(true, file.name);
    setTimeout(() => {
      const fileExt = file.name.split(".").pop().toLowerCase();
      if (fileExt === "xml") {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) updateProgress(e.loaded, e.total);
        };
        reader.onload = (e) => {
          parseXMLFeed(e.target.result);
          setLoadingState(false, file.name);
        };
        reader.readAsText(file);
      } else if (["csv", "xlsx", "xls"].includes(fileExt)) {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) updateProgress(e.loaded, e.total);
        };
        reader.onload = (e) => {
          parseSpreadsheetFeed(e.target.result);
          setLoadingState(false, file.name);
        };
        reader.readAsArrayBuffer(file);
      } else {
        alert("Unsupported file format.");
        setLoadingState(false, "Import failed");
      }
    }, 100);
  });

/* --- INPUT 2: FETCH FROM URL --- */
async function fetchFeedFromUrl() {
  const rawUrl = document.getElementById("urlInput").value.trim();
  if (!rawUrl) {
    alert("Please enter a valid URL.");
    return;
  }

  let fileExt = "xml";
  const cleanedPath = rawUrl.split("?")[0].toLowerCase();
  if (cleanedPath.endsWith(".csv")) fileExt = "csv";
  if (cleanedPath.endsWith(".xlsx") || cleanedPath.endsWith(".xls"))
    fileExt = "xlsx";

  const displayUrlName =
    cleanedPath.length > 40 ? "..." + cleanedPath.slice(-35) : cleanedPath;
  setLoadingState(true, displayUrlName);

  async function smartFetch(url, asBuffer = false) {
    async function readWithProgress(res) {
      const contentLength = res.headers.get("Content-Length");
      const total = contentLength ? parseInt(contentLength, 10) : null;
      let loaded = 0;

      const reader = res.body.getReader();
      const chunks = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        updateProgress(loaded, total);
      }

      const completeBuffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        completeBuffer.set(chunk, offset);
        offset += chunk.length;
      }

      if (asBuffer) {
        return completeBuffer.buffer;
      } else {
        return new TextDecoder("utf-8").decode(completeBuffer);
      }
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await readWithProgress(res);
    } catch (err) {
      console.warn("Direct fetch failed, trying CORS proxy fallbacks...", err);
      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      ];

      for (const proxyUrl of proxies) {
        try {
          console.log(`Trying proxy: ${proxyUrl}`);
          const proxyRes = await fetch(proxyUrl);
          if (proxyRes.ok) {
            return await readWithProgress(proxyRes);
          }
        } catch (e) {
          console.warn(`Proxy ${proxyUrl} failed.`, e);
        }
      }
      throw new Error(
        "Proxy fetch failed. Ensure the link is publicly accessible.",
      );
    }
  }

  try {
    if (fileExt === "xml") {
      const xmlText = await smartFetch(rawUrl, false);
      parseXMLFeed(xmlText);
    } else if (fileExt === "csv") {
      const csvText = await smartFetch(rawUrl, false);
      const encoder = new TextEncoder();
      parseSpreadsheetFeed(encoder.encode(csvText));
    } else {
      const arrayBuf = await smartFetch(rawUrl, true);
      parseSpreadsheetFeed(arrayBuf);
    }
    setLoadingState(false, displayUrlName);
  } catch (error) {
    console.error("Fetch Feed Error:", error);
    alert(
      `Failed to load feed from URL.\n\nReason: ${error.message}\n\nMake sure the URL is public and leads directly to the raw file.`,
    );
    setLoadingState(false, "Import failed");
    document.getElementById("productsGrid").innerHTML =
      `<div class="col-12"><div class="text-center py-5 bg-white rounded shadow-sm text-danger"><i class="fa-solid fa-triangle-exclamation fa-3x mb-3"></i><h3>Import Failed</h3><p>Could not fetch remote URL. Check network logs or try saving the file locally.</p></div></div>`;
  }
}

/* --- PARSER 1: XML SPREADSHEET --- */
function getTagContent(item, tagNames) {
  for (let name of tagNames) {
    let elements = item.getElementsByTagName(name);
    if (!elements.length && name.includes(":")) {
      elements = item.getElementsByTagNameNS("*", name.split(":")[1]);
    }
    if (elements.length > 0) return elements[0].textContent.trim();
  }
  return "";
}

function parseXMLFeed(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const items = xmlDoc.getElementsByTagName("item");

  const rawData = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    rawData.push({
      id: getTagContent(item, ["g:id", "id"]),
      title: getTagContent(item, ["g:title", "title"]),
      link: getTagContent(item, ["g:link", "link"]),
      imageLink: getTagContent(item, ["g:image_link", "image_link"]),
      price: getTagContent(item, ["g:price", "price"]),
      salePrice: getTagContent(item, ["g:sale_price", "sale_price"]),
      productType: getTagContent(item, ["g:product_type", "product_type"]),
      availability:
        getTagContent(item, ["g:availability", "availability"]) || "in stock",
      brand: getTagContent(item, ["g:brand", "brand"]),
    });
  }
  processAndRender(rawData);
}

/* --- PARSER 2: CSV / EXCEL SPREADSHEET --- */
function parseSpreadsheetFeed(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  const findVal = (row, options) => {
    const keys = Object.keys(row);
    for (let opt of options) {
      const matchedKey = keys.find(
        (k) =>
          k.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          opt.toLowerCase().replace(/[^a-z0-9]/g, ""),
      );
      if (matchedKey && row[matchedKey] !== "")
        return String(row[matchedKey]).trim();
    }
    return "";
  };

  const rawData = rows
    .map((row) => ({
      id: findVal(row, ["gid", "id"]),
      title: findVal(row, ["gtitle", "title", "name"]),
      link: findVal(row, ["glink", "link", "url"]),
      imageLink: findVal(row, ["gimagelink", "imagelink", "imageurl", "image"]),
      price: findVal(row, ["gprice", "price"]),
      salePrice: findVal(row, ["gsaleprice", "saleprice", "discountprice"]),
      productType: findVal(row, ["gproducttype", "producttype", "category"]),
      availability:
        findVal(row, ["gavailability", "availability", "stock"]) || "in stock",
      brand: findVal(row, ["gbrand", "brand"]),
    }))
    .filter((p) => p.title || p.id);

  processAndRender(rawData);
}

/* --- UNIFIED DATA PROCESSING --- */
function processAndRender(rawData) {
  allProducts = [];
  const categoryCounts = {};
  const brandsSet = new Set();

  rawData.forEach((item) => {
    const cleanPrice = item.price.replace(/[^0-9.]/g, "");
    const cleanSalePrice = item.salePrice.replace(/[^0-9.]/g, "");
    const categories = item.productType
      ? item.productType
          .split(">")
          .map((c) => c.trim())
          .filter(Boolean)
      : ["Uncategorized"];

    let currentPath = "";
    categories.forEach((cat, index) => {
      currentPath += (index === 0 ? "" : " > ") + cat;
      categoryCounts[currentPath] = (categoryCounts[currentPath] || 0) + 1;
    });

    if (item.brand) {
      brandsSet.add(item.brand.trim());
    }

    const issues = [];
    if (!item.id) issues.push("Missing ID");
    if (!item.title) issues.push("Missing Title");
    if (!item.link) issues.push("Missing Link");
    if (!item.imageLink) issues.push("Missing Image");
    if (!cleanPrice) issues.push("Missing Price");

    allProducts.push({
      id: item.id,
      title: item.title,
      link: item.link,
      imageLink: item.imageLink,
      price: cleanPrice,
      salePrice: cleanSalePrice,
      productType: categories.join(" > "),
      categories,
      availability: item.availability,
      brand: item.brand,
      issues: issues,
    });
  });

  document.getElementById("totalCount").textContent = allProducts.length;
  document.getElementById("badgeAll").textContent = allProducts.length;

  const productsWithIssues = allProducts.filter(
    (p) => p.issues.length > 0,
  ).length;
  const diagCard = document.getElementById("diagnosticsCard");
  if (diagCard) {
    if (productsWithIssues > 0) {
      document.getElementById("issueCount").textContent = productsWithIssues;
      diagCard.classList.remove("d-none");
    } else {
      diagCard.classList.add("d-none");
    }
  }

  buildCategoryTree(categoryCounts);
  buildBrandList(Array.from(brandsSet).sort((a, b) => a.localeCompare(b)));
  filterCategory("All");
}

function buildBrandList(brands) {
  const container = document.getElementById("brandsList");
  if (!container) return;

  if (!brands.length) {
    container.innerHTML = `<span class="text-muted">No brands found</span>`;
    return;
  }

  let html = "";
  brands.forEach((brand, idx) => {
    const escapedBrand = brand.replace(/"/g, "&quot;");
    html += `
      <div class="form-check mb-1">
        <input class="form-check-input brand-filter-cb" type="checkbox" value="${escapedBrand}" id="brandCb_${idx}" onchange="applyFilters()">
        <label class="form-check-label text-truncate w-100" title="${escapedBrand}" for="brandCb_${idx}">
          ${brand}
        </label>
      </div>
    `;
  });
  container.innerHTML = html;
}

/* --- RENDERING & UI --- */
function buildCategoryTree(counts) {
  const treeContainer = document.getElementById("categoryTree");
  treeContainer.innerHTML = `<li class="list-group-item d-flex justify-content-between align-items-center active list-group-item-action" data-path="All" onclick="filterCategory('All')" style="cursor:pointer; border-radius: 6px; margin-bottom: 2px;">
    All Products
    <span class="badge bg-light text-dark rounded-pill" id="badgeAll">${allProducts.length}</span>
  </li>`;

  const sortedPaths = Object.keys(counts).sort();
  sortedPaths.forEach((path) => {
    const parts = path.split(" > ");
    const depth = parts.length - 1;
    const displayName = parts[parts.length - 1];

    const li = document.createElement("li");
    li.className = `list-group-item d-flex justify-content-between align-items-center list-group-item-action`;
    li.style.cursor = "pointer";
    li.style.borderRadius = "6px";
    li.style.marginBottom = "2px";
    li.style.paddingLeft = `${1 + depth * 1.5}rem`;
    li.setAttribute("data-path", path);
    li.onclick = () => filterCategory(path);
    li.innerHTML = `<span>${displayName}</span><span class="badge bg-secondary rounded-pill category-badge">${counts[path]}</span>`;
    treeContainer.appendChild(li);
  });
}

let searchQuery = "";
let searchTimeout = null;

function handleSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    searchQuery = input.value.toLowerCase().trim();
    applyFilters();
  }, 300);
}

function filterCategory(path) {
  activeFilter = path;
  const items = document.querySelectorAll("#categoryTree li");
  items.forEach((item) => {
    const itemPath = item.getAttribute("data-path");
    const badge = item.querySelector(".badge");
    if ((path === "All" && itemPath === "All") || itemPath === path) {
      item.classList.add("active");
      if (badge) {
        badge.classList.remove("bg-secondary");
        badge.classList.add("bg-light", "text-dark");
      }
    } else {
      item.classList.remove("active");
      if (badge && itemPath !== "All") {
        badge.classList.remove("bg-light", "text-dark");
        badge.classList.add("bg-secondary");
      } else if (badge && itemPath === "All") {
        badge.classList.remove("bg-light", "text-dark");
        badge.classList.add("bg-secondary");
      }
    }
  });

  applyFilters();
}

let renderLimit = 50;
let scrollObserver = null;

function applyFilters() {
  let filtered = [];

  if (activeFilter === "ISSUES") {
    filtered = allProducts.filter((p) => p.issues && p.issues.length > 0);
  } else if (activeFilter === "All") {
    filtered = allProducts;
  } else {
    filtered = allProducts.filter(
      (p) =>
        p.productType === activeFilter ||
        p.productType.startsWith(activeFilter + " > "),
    );
  }

  if (searchQuery) {
    filtered = filtered.filter((p) => {
      const titleMatch = p.title && p.title.toLowerCase().includes(searchQuery);
      const idMatch =
        p.id && p.id.toString().toLowerCase().includes(searchQuery);
      return titleMatch || idMatch;
    });
  }

  // --- ADVANCED FILTERS ---
  const inStockOnly = document.getElementById("inStockOnly")?.checked;
  const minPrice = parseFloat(document.getElementById("minPrice")?.value);
  const maxPrice = parseFloat(document.getElementById("maxPrice")?.value);
  const selectedBrands = Array.from(
    document.querySelectorAll(".brand-filter-cb:checked"),
  ).map((cb) => cb.value);

  if (
    inStockOnly ||
    !isNaN(minPrice) ||
    !isNaN(maxPrice) ||
    selectedBrands.length > 0
  ) {
    filtered = filtered.filter((p) => {
      // 1. Availability
      if (inStockOnly && !p.availability.toLowerCase().includes("in stock"))
        return false;

      // 2. Price Range
      const price = parseFloat(p.salePrice || p.price);
      if (!isNaN(price)) {
        if (!isNaN(minPrice) && price < minPrice) return false;
        if (!isNaN(maxPrice) && price > maxPrice) return false;
      }

      // 3. Brands
      if (selectedBrands.length > 0) {
        if (!p.brand || !selectedBrands.includes(p.brand.trim())) return false;
      }

      return true;
    });
  }

  // --- SORTING ---
  const sortSelect = document.getElementById("sortSelect");
  const sortValue = sortSelect ? sortSelect.value : "default";

  if (sortValue !== "default") {
    // We clone the filtered array before sorting to avoid mutating the source allProducts if there were no filters applied
    if (filtered === allProducts) {
      filtered = [...allProducts];
    }

    filtered.sort((a, b) => {
      if (sortValue === "price-asc") {
        return (
          (parseFloat(a.salePrice || a.price) || 0) -
          (parseFloat(b.salePrice || b.price) || 0)
        );
      } else if (sortValue === "price-desc") {
        return (
          (parseFloat(b.salePrice || b.price) || 0) -
          (parseFloat(a.salePrice || a.price) || 0)
        );
      } else if (sortValue === "discount-desc") {
        const getDiscount = (p) => {
          if (!p.salePrice || !p.price) return 0;
          const s = parseFloat(p.salePrice);
          const r = parseFloat(p.price);
          if (r <= s || r === 0) return 0;
          return (r - s) / r;
        };
        return getDiscount(b) - getDiscount(a);
      } else if (sortValue === "title-asc") {
        return (a.title || "").localeCompare(b.title || "");
      } else if (sortValue === "title-desc") {
        return (b.title || "").localeCompare(a.title || "");
      }
      return 0;
    });
  }

  renderLimit = 50;
  renderProducts(filtered, false);
}

function renderProducts(products, append = false) {
  const grid = document.getElementById("productsGrid");

  if (!append) {
    grid.innerHTML = "";
    if (products.length === 0) {
      grid.innerHTML = `<div class="col-12"><div class="text-center py-5 bg-white rounded shadow-sm text-muted"><i class="fa-solid fa-magnifying-glass fa-3x mb-3 opacity-50"></i><h3>No matching items</h3><p>Try selecting a different category filter or adjusting your search.</p></div></div>`;
      return;
    }
  }

  const fragment = document.createDocumentFragment();
  const startIndex = append ? renderLimit - 50 : 0;
  const itemsToRender = products.slice(startIndex, renderLimit);

  itemsToRender.forEach((p) => {
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6 col-lg-4 col-xxl-3 d-flex";

    const hasDiscount =
      p.salePrice && parseFloat(p.salePrice) < parseFloat(p.price);

    let priceHtml = hasDiscount
      ? `<span class="text-danger fw-bold fs-5 me-2">${p.salePrice}</span><span class="text-muted text-decoration-line-through small"><i class="fa-solid fa-bangladeshi-taka-sign"></i> ${p.price}</span>`
      : `<span class="fw-bold fs-5"><i class="fa-solid fa-bangladeshi-taka-sign"></i> ${p.price || "N/A"}</span>`;

    const availBadge = p.availability.toLowerCase().includes("in stock")
      ? `<span class="badge bg-success position-absolute top-0 end-0 m-2 shadow-sm">In Stock</span>`
      : `<span class="badge bg-danger position-absolute top-0 end-0 m-2 shadow-sm">${p.availability}</span>`;

    const issuesBadge =
      p.issues && p.issues.length > 0
        ? `<span class="badge bg-warning text-dark position-absolute top-0 start-0 m-2 shadow-sm" title="Issues: ${p.issues.join(", ")}" style="cursor: help;"><i class="fa-solid fa-triangle-exclamation me-1"></i>${p.issues.length}</span>`
        : "";

    col.innerHTML = `
      <div class="card shadow-sm w-100 border-0 h-100 d-flex flex-column position-relative">
        ${availBadge}
        ${issuesBadge}
        <div style="height: 220px; background-color: #f8f9fa; display: flex; align-items: center; justify-content: center; overflow: hidden; border-top-left-radius: var(--bs-card-inner-border-radius); border-top-right-radius: var(--bs-card-inner-border-radius); padding: 1rem;">
          <img src="${p.imageLink}" alt="Product" class="img-fluid" style="max-height: 100%; object-fit: contain;" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23f8f9fa\\'/><text x=\\'50%\\' y=\\'50%\\' font-size=\\'12\\' text-anchor=\\'middle\\' fill=\\'%23adb5bd\\'>No Image</text></svg>'">
        </div>
        <div class="card-body d-flex flex-column">
          ${p.brand ? `<small class="text-muted text-uppercase fw-bold mb-1" style="font-size: 0.7rem; letter-spacing: 0.5px;">${p.brand}</small>` : ""}
          <h6 class="card-title mb-1 text-truncate" title="${p.title}">${p.title || "Unnamed Product"}</h6>
          <small class="text-muted mb-2 d-block text-truncate" style="font-size: 0.75rem;" title="${p.id}">ID: ${p.id || "N/A"}</small>
          <small class="text-muted text-truncate d-block mb-3" style="font-size: 0.75rem;">${p.productType.replace(/ > /g, " • ")}</small>
          
          <div class="mt-auto pt-3 border-top">
            <div class="mb-3">${priceHtml}</div>
            <a href="${p.link}" target="_blank" class="btn btn-primary w-100 fw-bold" rel="noopener noreferrer">View Product <i class="fa-solid fa-arrow-up-right-from-square ms-1"></i></a>
          </div>
        </div>
      </div>
    `;
    fragment.appendChild(col);
  });

  grid.appendChild(fragment);

  if (scrollObserver) scrollObserver.disconnect();

  if (renderLimit < products.length) {
    const lastCard = grid.lastElementChild;
    scrollObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        renderLimit += 50;
        renderProducts(products, true);
      }
    });
    scrollObserver.observe(lastCard);
  }
}
