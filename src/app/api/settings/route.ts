import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCsrf, handleError, ok, parseJson } from "@/lib/api";
import { logActivity, requireUser } from "@/lib/auth";
import { getSettings, serializeSettings } from "@/lib/games/numbers";
import { settingsSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const settings = await getSettings(user.tenantId);
    return ok({ settings: serializeSettings(settings) });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    ensureCsrf(req);
    const user = await requireUser();
    const data = await parseJson(req, settingsSchema);
    const settings = await prisma.setting.upsert({
      where: { tenantId: user.tenantId },
      update: data,
      create: { tenantId: user.tenantId, ...data }
    });
    await logActivity(user.id, user.tenantId, "Updated betting settings");
    return ok({ settings: serializeSettings(settings) });
  } catch (error) {
    return handleError(error);
  }
}
