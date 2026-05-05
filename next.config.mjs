const isStaticExport = process.env.NEXT_OUTPUT_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isStaticExport
    ? {
        output: "export",
        trailingSlash: true,
        basePath
      }
    : {})
};

export default nextConfig;
