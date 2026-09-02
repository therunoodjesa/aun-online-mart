import { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#01193D" />
        <title>AUN Online Mart</title>
        <meta name="description" content="Shop campus favourites, groceries, cafeteria meals, and services through AUN Online Mart." />
        <link rel="icon" href="/aom-icon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/aom-icon.svg" type="image/svg+xml" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="AUN Online Mart" />
        <meta property="og:title" content="AUN Online Mart" />
        <meta property="og:description" content="Your campus marketplace for food, groceries, cafeteria meals, and services." />
        <meta property="og:image" content="https://aun-online-mart.vercel.app/aom-social-card.png" />
        <meta property="og:image:alt" content="The AUN Online Mart logo" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AUN Online Mart" />
        <meta name="twitter:description" content="Your campus marketplace for food, groceries, cafeteria meals, and services." />
        <meta name="twitter:image" content="https://aun-online-mart.vercel.app/aom-social-card.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AOM Operations" />
        <link rel="manifest" href="/aom-manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/aom-icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/aom-sw.js').catch(function () {}); }); }` }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
