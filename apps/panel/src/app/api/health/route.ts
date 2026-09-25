import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [users, servers, nodes] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.node.count(),
    ]);
    return NextResponse.json({
      status: "ok",
      database: "reachable",
      firstRun: users === 0,
      counts: { users, servers, nodes },
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: "degraded", database: "unreachable", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
