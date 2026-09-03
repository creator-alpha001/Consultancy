/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 writes its own AGENTS.md/CLAUDE.md into the app directory
  // unless told not to. This repo's instructions live in the root
  // CLAUDE.md and a generated one here competes with them.
  agentRules: false,
};
export default nextConfig;
