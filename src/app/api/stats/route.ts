import { handleError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getTenantStats } from "@/lib/stats";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getTenantStats(user.tenantId));
  } catch (error) {
    return handleError(error);
  }
}
