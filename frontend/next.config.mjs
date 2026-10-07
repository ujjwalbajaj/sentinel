import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": path.join(root, "src/shims/base-account.ts"),
      "@react-native-async-storage/async-storage": path.join(root, "src/shims/async-storage.ts"),
    };
    return config;
  },
};

export default nextConfig;
