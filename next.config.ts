import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow the dev server to be reached through an ngrok tunnel
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
