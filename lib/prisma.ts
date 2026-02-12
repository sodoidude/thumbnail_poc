// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

/**
 * Next.js dev 환경에서 hot-reload가 반복되면
 * PrismaClient가 여러 번 생성되는 문제를 방지하기 위한 패턴
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"], // PoC에서는 error만 로그
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
