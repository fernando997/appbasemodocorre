import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite acessar o dev server pela rede local (http://192.168.0.6:3000)
  allowedDevOrigins: ["192.168.0.6"],
};

export default nextConfig;
