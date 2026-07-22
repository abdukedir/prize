import { adminRoles, SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function resolveBoardOwner(user: SessionUser, requestedOwnerId?: string | null) {
  if (!adminRoles.includes(user.role)) return user.id;
  if (!requestedOwnerId || requestedOwnerId === user.id) return user.id;

  const owner = await prisma.user.findFirst({
    where: {
      id: requestedOwnerId,
      tenantId: user.tenantId,
      disabled: false
    },
    select: { id: true }
  });

  if (!owner) throw new Response("Board owner not found", { status: 404 });
  return owner.id;
}

export function ownerIdFromRequestUrl(url: string) {
  return new URL(url).searchParams.get("employeeId");
}
