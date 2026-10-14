// app/manifest.js
export default function manifest() {
  return {
    name: "Vreedits",
    short_name: "Vreedits",
    description: "Vreedits: feed, communities, chat and AI tools in one app.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#13051f",
    theme_color: "#13051f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}