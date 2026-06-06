/** @type {import('next').NextConfig} */
// Dynamic Next server (was output:"export") so we can run an /api route for live
// market caps. Token pages stay SSG via generateStaticParams; only /api/* is dynamic.
const nextConfig = { images: { unoptimized: true }, trailingSlash: true };
export default nextConfig;
