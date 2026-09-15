# Responsive Wix landing page

This implementation replaces the fixed 1728px Figma coordinates with responsive layout rules. It keeps the existing Wix footer unchanged by using separate custom elements for the header and page body.

## Files

- `wardrobe-storefront.js`: Custom Element implementation and responsive CSS.
- `home-page.js`: Velo page code that loads live products from `Stores/Products`.

## Install in Wix Editor

1. Save a backup/duplicate of the current HOME page.
2. Turn on **Dev Mode**.
3. Under **Public**, create the folder `custom-elements` if it does not already exist. Inside it, add `wardrobe-storefront.js` and paste the matching file contents into it. The Wix path should be `public/custom-elements/wardrobe-storefront.js`.
4. Safest first test: keep your existing Wix header. The `store-header` element is optional, and the page code will work without it.
5. If you later want the redesigned header, add a **Custom Element**:
   - Source: Velo file
   - Tag name: `store-header`
   - Element ID: `storeHeader`
   - Stretch it across the page width.
   - Recommended desktop height: `198px`.
6. Add the required landing-page **Custom Element** to the HOME page:
   - Source: the same Velo file
   - Tag name: `store-landing`
   - Element ID: `storeLanding`
   - Stretch it across the page width.
   - Recommended starting desktop height: `2150px`.
7. Paste `home-page.js` into the HOME page-code panel.
8. Keep the existing footer directly below `#storeLanding`.
9. Delete or hide the old hero and product gallery only after previewing the new elements successfully.

## Hero image

The code initially uses the first live store product image. To use a dedicated campaign image:

1. Upload the image to Wix Media.
2. Copy its HTTPS URL.
3. Paste it into `HERO_IMAGE_URL` near the top of `home-page.js`.

## Responsive behavior

- Above 1180px: sidebar filters and a four-column product grid.
- 921–1180px: filters collapse into a panel; the grid remains four columns.
- 681–920px: stacked hero and three-column grid.
- 431–680px: compact navigation and two-column grid.
- Below 431px: two-column compact cards.

The page uses:

- A fluid maximum-width container
- CSS Grid and Flexbox
- `clamp()` for type and spacing
- Container queries based on the Custom Element's real width
- Aspect ratios rather than fixed image dimensions

## Important Wix Editor limitation

The classic Wix Editor itself uses a fixed design canvas. The custom elements are responsive *inside the width Wix gives them*, so stretch both elements across the available page width. For independently controlled desktop/tablet/mobile breakpoints throughout the whole site, Wix Studio provides stronger native responsive controls.

## Before publishing

- Check the actual slugs for Women, Men, and Sale in `categoryPaths`.
- Confirm `#storeHeader` and `#storeLanding` match the element IDs exactly.
- Preview at approximately 1024px, 1280px, 1440px, and 1920px widths.
- Adjust the custom element's editor height if Wix clips the bottom row.
- Test product links, cart navigation, and the mobile editor separately.
