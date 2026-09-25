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
    grid.innerHTML = `<div class="empty-state">
      <h3>Processing Feed...</h3>
      <p style="margin-top: 8px;" id="progressText">Downloading and parsing data. Please wait.</p>
      <div class="progress-container">
        <div class="progress-bar" id="progressBar"></div>
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
    progressBar.style.animation = "none";
    progressText.textContent = `Downloading: ${percent}%`;
  } else {
    // If total is missing, or loaded exceeds total (happens when the browser transparently decompresses gzip)
    const mb = (loaded / (1024 * 1024)).toFixed(2);
    progressText.textContent = `Downloading: ${mb} MB`;
    progressBar.style.width = "30%";
    progressBar.style.animation = "loadingProgress 1.5s infinite ease-in-out";
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
    }, 100); // Small timeout to allow UI to render loading state
  });

/* --- INPUT 2: FETCH FROM URL --- */
async function fetchFeedFromUrl() {
  const rawUrl = document.getElementById("urlInput").value.trim();
  if (!rawUrl) {
    alert("Please enter a valid URL.");
    return;
  }

  let fileExt = "xml"; // Default assumption
  const cleanedPath = rawUrl.split("?")[0].toLowerCase();
  if (cleanedPath.endsWith(".csv")) fileExt = "csv";
  if (cleanedPath.endsWith(".xlsx") || cleanedPath.endsWith(".xls"))
    fileExt = "xlsx";

  const displayUrlName =
    cleanedPath.length > 40 ? "..." + cleanedPath.slice(-35) : cleanedPath;
  setLoadingState(true, displayUrlName);

  // Helper to fetch directly, or use a public proxy if CORS blocks it
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
      // Read CSV as text, but convert to buffer for SheetJS consistency
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
      `<div class="empty-state"><h3>Import Failed</h3><p style="margin-top: 8px;">Could not fetch remote URL. Check network logs or try saving the file locally.</p></div>`;
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
    });
  });

  document.getElementById("totalCount").textContent = allProducts.length;
  document.getElementById("badgeAll").textContent = allProducts.length;

  buildCategoryTree(categoryCounts);
  filterCategory("All");
}

/* --- RENDERING & UI --- */
function buildCategoryTree(counts) {
  const treeContainer = document.getElementById("categoryTree");
  treeContainer.innerHTML = `<li class="category-item active" data-path="All" onclick="filterCategory('All')"><span>All Products</span><span class="badge" id="badgeAll">${allProducts.length}</span></li>`;

  const sortedPaths = Object.keys(counts).sort();
  sortedPaths.forEach((path) => {
    const parts = path.split(" > ");
    const depth = parts.length - 1;
    const displayName = parts[parts.length - 1];

    const li = document.createElement("li");
    li.className = `category-item depth-${depth}`;
    li.setAttribute("data-path", path);
    li.onclick = () => filterCategory(path);
    li.innerHTML = `<span>${displayName}</span><span class="badge">${counts[path]}</span>`;
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
  const items = document.querySelectorAll(".category-item");
  items.forEach((item) => {
    const itemPath = item.getAttribute("data-path");
    if ((path === "All" && itemPath === "All") || itemPath === path) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  applyFilters();
}

let renderLimit = 50;
let scrollObserver = null;

function applyFilters() {
  let filtered =
    activeFilter === "All"
      ? allProducts
      : allProducts.filter(
          (p) =>
            p.productType === activeFilter ||
            p.productType.startsWith(activeFilter + " > "),
        );

  if (searchQuery) {
    filtered = filtered.filter((p) => {
      const titleMatch = p.title && p.title.toLowerCase().includes(searchQuery);
      const idMatch =
        p.id && p.id.toString().toLowerCase().includes(searchQuery);
      return titleMatch || idMatch;
    });
  }

  renderLimit = 50; // Reset pagination for new filters
  renderProducts(filtered, false);
}

function renderProducts(products, append = false) {
  const grid = document.getElementById("productsGrid");

  if (!append) {
    grid.innerHTML = "";
    if (products.length === 0) {
      grid.innerHTML = `<div class="empty-state"><h3>No matching items</h3><p style="margin-top: 8px;">Try selecting a different category filter or adjusting your search.</p></div>`;
      return;
    }
  }

  const fragment = document.createDocumentFragment();
  const startIndex = append ? renderLimit - 50 : 0;
  const itemsToRender = products.slice(startIndex, renderLimit);

  itemsToRender.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card";
    const hasDiscount =
      p.salePrice && parseFloat(p.salePrice) < parseFloat(p.price);

    let priceHtml = hasDiscount
      ? `<span class="sale-price">৳${p.salePrice}</span><span class="original-price">৳${p.price}</span>`
      : `<span class="regular-price">৳${p.price || "N/A"}</span>`;
    const availClass = p.availability.toLowerCase().includes("in stock")
      ? "in-stock"
      : "";

    card.innerHTML = `
          <div class="product-img-container">
            <img class="product-img" src="${p.imageLink}" alt="Product Image" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23eee\\'/><text x=\\'50%\\' y=\\'50%\\' font-size=\\'12\\' text-anchor=\\'middle\\' fill=\\'%23aaa\\'>No Image</text></svg>'">
            <span class="availability-tag ${availClass}">${p.availability}</span>
          </div>
          <div class="product-info">
            <div>
              ${p.brand ? `<div class="product-brand">${p.brand}</div>` : ""}
              <div class="product-title" title="${p.title}">${p.title || "Unnamed Product"}</div>
              <div class="product-id" title="${p.id}">${p.id || "N/A"}</div>
              <div class="product-category-path">${p.productType.replace(/ > /g, " • ")}</div>
            </div>
            <div>
              <div class="price-row">${priceHtml}</div>
              <a href="${p.link}" target="_blank" class="btn-view" rel="noopener noreferrer">View Product ↗</a>
            </div>
          </div>
        `;
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);

  // Re-attach intersection observer for infinite scroll
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
