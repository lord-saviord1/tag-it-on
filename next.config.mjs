/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export: `next build` writes a plain HTML/JS site to the `out/` folder,
  // which Cloudflare Pages (or any static host) can serve directly.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
