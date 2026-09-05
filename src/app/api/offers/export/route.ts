import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildOffersWorkbook } from "@/lib/excelExport";

export async function GET() {
  const offers = await prisma.offer.findMany({
    orderBy: [{ matchScore: "desc" }, { fetchedAt: "desc" }],
  });

  const buffer = await buildOffersWorkbook(offers);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="candidatures-${date}.xlsx"`,
    },
  });
}
