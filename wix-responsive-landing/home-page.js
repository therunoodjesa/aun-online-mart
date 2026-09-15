// Paste this into the HOME page's Velo page-code panel.
// Add two Custom Elements first:
//   Header element: tag name "store-header", ID #storeHeader
//   Page element:   tag name "store-landing", ID #customElement1

import wixData from "wix-data";
import wixLocationFrontend from "wix-location-frontend";
import wixEcomFrontend from "wix-ecom-frontend";

const HERO_IMAGE_URL = ""; // Optional: paste the HTTPS URL for your chosen Wix Media image.
const SHOP_URL = "/category/all-products";
const WISHLIST_URL = "/my-wishlist";
const ACCOUNT_URL = "/account/my-orders";

function wixImageToHttps(media) {
  const source = typeof media === "string" ? media : media?.src;
  if (!source) return "";
  if (source.startsWith("http://") || source.startsWith("https://")) return source;

  if (source.startsWith("wix:image://v1/")) {
    const mediaId = source.slice("wix:image://v1/".length).split("/")[0];
    return `https://static.wixstatic.com/media/${mediaId}`;
  }

  return source;
}

function referenceId(reference) {
  if (typeof reference === "string") return reference;
  return reference?._id || reference?.id || "";
}

function optionValues(productOptions, possibleNames) {
  const entries = Object.entries(productOptions || {});
  const match = entries.find(([name]) =>
    possibleNames.includes(String(name).toLowerCase())
  );
  if (!match) return [];

  const option = match[1] || {};
  const choices = option.choices || option.value || option.values || [];
  return (Array.isArray(choices) ? choices : [])
    .map((choice) => choice?.description || choice?.value || choice?.title || choice)
    .filter(Boolean);
}

async function loadStorefrontProducts() {
  const [productsResult, collectionsResult] = await Promise.all([
    wixData.query("Stores/Products")
      .include("collections")
      .descending("_createdDate")
      .limit(100)
      .find(),
    wixData.query("Stores/Collections")
      .limit(100)
      .find()
  ]);

  const collectionNames = new Map(
    collectionsResult.items.map((collection) => [collection._id, collection.name])
  );

  return productsResult.items.map((product) => {
    const categoryNames = (Array.isArray(product.collections) ? product.collections : [])
      .map(referenceId)
      .map((id) => collectionNames.get(id))
      .filter(Boolean);

    return {
      id: product._id,
      name: product.name,
      image: wixImageToHttps(product.mainMedia),
      url: product.productPageUrl,
      price: product.price,
      discountedPrice: product.discountedPrice,
      currency: product.currency || "NGN",
      ribbon: product.ribbon || "",
      createdDate: product._createdDate,
      categories: categoryNames,
      sizes: optionValues(product.productOptions, ["size", "sizes"]),
      colours: optionValues(product.productOptions, ["color", "colour", "colors", "colours"])
    };
  });
}

async function handleStorefrontAction(event) {
  const detail = event?.detail || {};

  if (detail.action === "home") {
    wixLocationFrontend.to("/");
    return;
  }

  if (detail.action === "shop") {
    // The button also scrolls to the on-page catalog.
    return;
  }

  if (detail.action === "cart") {
    await wixEcomFrontend.navigateToCartPage();
    return;
  }

  if (detail.action === "account") {
    wixLocationFrontend.to(ACCOUNT_URL);
    return;
  }

  if (detail.action === "menu") {
    wixLocationFrontend.to(SHOP_URL);
    return;
  }

  if (detail.action === "collection") {
    // Replace these paths if your Wix category slugs are different.
    const categoryPaths = {
      new: SHOP_URL,
      women: "/category/women",
      men: "/category/men",
      sale: "/category/sale"
    };
    wixLocationFrontend.to(categoryPaths[detail.value] || SHOP_URL);
    return;
  }

  if (detail.action === "search") {
    wixLocationFrontend.to("/search-results");
    return;
  }

  if (detail.action === "product" && detail.url) {
    wixLocationFrontend.to(detail.url);
    return;
  }

  if (detail.action === "wishlist") {
    // The heart state is immediately reflected in the custom element.
    // Connect this action to a members-only wishlist collection if you want
    // the saved state to persist across devices.
    console.log("Wishlist changed:", detail.productId, detail.saved);
    return;
  }

  if (detail.action === "open-wishlist") {
    wixLocationFrontend.to(WISHLIST_URL);
  }
}

$w.onReady(async function () {
  const landing = $w("#customElement1");

  if (typeof landing.setAttribute !== "function") {
    console.error(
      "#customElement1 is not configured as a Wix Custom Element. " +
        "Add it from Add Elements > Embed > Custom Element, choose the Velo file " +
        "public/custom-elements/wardrobe-storefront.js, and use the tag name store-landing."
    );
    return;
  }
  let header;
  try {
    header = $w("#storeHeader");
  } catch (error) {
    console.error(
      "#storeHeader is missing. Add a Wix Custom Element with the ID storeHeader, " +
        "the Velo file public/custom-elements/wardrobe-storefront.js, and the tag store-header."
    );
    return;
  }

  if (typeof header.setAttribute !== "function") {
    console.error(
      "#storeHeader is not configured as a Wix Custom Element. " +
        "Add it from Add Elements > Embed > Custom Element, choose the Velo file " +
        "public/custom-elements/wardrobe-storefront.js, and use the tag name store-header."
    );
    return;
  }

  header.setAttribute("brand", "THE 17TH CENTURY");
  header.setAttribute("promo", "Free shipping on qualifying orders · Returns within 30 days");
  header.setAttribute("cart-count", "0");
  header.on("storefront-action", handleStorefrontAction);

  landing.setAttribute("hero-eyebrow", "NEW ARRIVALS");
  landing.setAttribute("hero-title", "Designed to dress you up, from head to toes.");
  landing.setAttribute(
    "hero-copy",
    "Inspired by the dream that keeps you awake. Designed for the people defining what comes next."
  );
  landing.setAttribute("currency-locale", "en-NG");

  landing.on("storefront-action", handleStorefrontAction);

  try {
    const products = await loadStorefrontProducts();
    landing.setAttribute("products", JSON.stringify(products));
    landing.setAttribute("hero-image", HERO_IMAGE_URL || products[0]?.image || "");
  } catch (error) {
    console.error("The custom storefront could not load Wix products:", error);
    landing.setAttribute("products", "[]");
  }
});
