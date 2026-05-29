import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-three-fiber manages the WebGL context manually; StrictMode's dev double-mount
  // force-loses that context (blanking the 3D house). Disable it so dev matches production.
  reactStrictMode: false,
  // Allow loading dev resources (HMR) when the app is opened via 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
