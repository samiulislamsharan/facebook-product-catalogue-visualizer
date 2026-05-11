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
**[Insert your GitHub Pages URL here]**

## 🛠️ How to Use

1. Open the application in any modern web browser.
2. Click the **"Choose XML File"** button.
3. Upload your standard Facebook/Google product feed XML file (e.g., `products.xml`).
4. Use the left sidebar to navigate through your extracted categories and explore your products.

## 💻 Local Development

Because this app is a standalone, single-file application, no complex build environments or package managers (like `npm`) are required.

1. Clone the repository:
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/xml-catalogue-visualizer.git
