/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15 promoted this out of `experimental` (it was
  // experimental.serverComponentsExternalPackages in 14).
  serverExternalPackages: ['xlsx'],
}

module.exports = nextConfig
