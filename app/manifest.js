// Makes Vreedits installable: name, colours, icons, and how it opens.
export default function manifest() {
  return {
    id: "/",
    name: "Vreedits",
    short_name: "Vreedits",
    description: "The study app with Syna, your AI study buddy, Mind Gym, and a school-first feed.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#13051f",
    theme_color: "#13051f",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png?m=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}