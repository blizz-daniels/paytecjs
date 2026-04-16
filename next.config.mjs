/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/*": ["./data/department-groups.csv", "./templates/**/*"],
  },
  serverExternalPackages: ["puppeteer", "sqlite3"],
};

export default nextConfig;
