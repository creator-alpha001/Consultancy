/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API base URL is server-side only: the browser never talks to the
  // API directly, so a session token never has to live in JS the page
  // can read. See src/lib/api.ts.
  env: { API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:3000' },
};
export default nextConfig;
