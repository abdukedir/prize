import { prisma } from "@/lib/prisma";
import { handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser(["ADMIN"]);
    const logs = await prisma.activityLog.findMany({
      where: { tenantId: user.tenantId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return ok({ logs });
  } catch (error) {
    return handleError(error);
  }
}
