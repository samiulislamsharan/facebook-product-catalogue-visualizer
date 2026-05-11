# 🛍️ XML Product Catalogue Visualizer

A lightweight, client-side web application designed to parse, visualize, and filter Facebook/Google XML product catalogue feeds. Built entirely with native web APIs, this tool processes your data securely inside your browser without uploading anything to an external server.

## ✨ Features

- **🚀 Zero-Server Processing:** Uses native `DOMParser` to process heavy XML files entirely client-side.
- **📊 Dynamic Dashboard:** Instantly calculates total product counts and extracts pricing metrics.
- **🗂️ Automated Category Tree:** Parses nested `<g:product_type>` tags to generate an indented, clickable category and subcategory filtering system.
- **🏷️ Smart Price Badging:** Automatically detects `<g:sale_price>` markdowns to render strikethroughs and discount tags.
- **📱 Responsive UI:** Clean card-based design built to adapt seamlessly to both desktop and mobile screens.

## 🚀 Live Demo

You can access the live visualizer here:
**[https://samiulislamsharan.github.io/facebook-product-catalogue-visualizer/](https://samiulislamsharan.github.io/facebook-product-catalogue-visualizer/)**

## 🛠️ How to Use

1. Open the application in any modern web browser.
2. Click the **"Choose XML File"** button.
3. Upload your standard Facebook/Google product feed XML file (e.g., `products.xml`).
4. Use the left sidebar to navigate through your extracted categories and explore your products.

## 💻 Local Development

Because this app is a standalone, single-file application, no complex build environments or package managers (like `npm`) are required.

1. Clone the repository:

   ```bash
   https://github.com/samiulislamsharan/facebook-product-catalogue-visualizer.git
   ```

2. Open index.html directly in your browser.

## 📄 Feed Compatibility

This visualizer supports standard RSS 2.0 namespace formats commonly used by Google Merchant Center and Facebook Commerce Manager, including:

- `<g:id>`
- `<g:title>`
- `<g:product_type>` (Supports nested paths using `>` delimiters)
- `<g:image_link>`
- `<g:price>` & `<g:sale_price>`
- `<g:availability>`

## 🛡️ Privacy

All data parsing occurs directly within the user's local DOM. Your product catalogues are never stored, cached, or transmitted over the internet.
