import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // self-contained server bundle (node server.js) for running on small devices such as the UNO Q
  output: process.env.NEXT_STANDALONE ? "standalone" : undefined,
  // allow the dev server to be reached through an ngrok tunnel
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
