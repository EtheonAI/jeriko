/** @type {import('next').NextConfig} */

const CDN = "https://releases.jeriko.ai";
const GITHUB_RAW =
  "https://raw.githubusercontent.com/EtheonAI/jeriko/main/scripts";

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // curl -fsSL https://jeriko.ai/install.sh | bash
      {
        source: "/install.sh",
        destination: `${CDN}/install.sh`,
        permanent: false,
      },
      // irm https://jeriko.ai/install.ps1 | iex
      {
        source: "/install.ps1",
        destination: `${GITHUB_RAW}/install.ps1`,
        permanent: false,
      },
      // curl -fsSL https://jeriko.ai/install.cmd -o install.cmd && install.cmd
      {
        source: "/install.cmd",
        destination: `${GITHUB_RAW}/install.cmd`,
        permanent: false,
      },
      // Convenience alias: curl -fsSL https://jeriko.ai/install | bash
      {
        source: "/install",
        destination: `${CDN}/install.sh`,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
