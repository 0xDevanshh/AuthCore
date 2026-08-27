import { prisma } from "../config/prisma.ts";

/**
 * Returns the permission keys granted to a role.
 *
 * Plain strings rather than PermissionKey: rows come from the database,
 * where a role may carry a key this build's catalog does not know about
 * (seeded by an older version, or added by hand). Narrowing here would
 * mean either lying about the type or dropping unrecognised keys.
 *
 * Sorted for stable output; empty array when the role has no permissions
 * or does not exist.
 */
export async function getRolePermissions(
  roleId: string,
): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },

    select: {
      permission: {
        select: { key: true },
      },
    },
  });

  return rows
    .map((row) => row.permission.key)
    .sort();
}
