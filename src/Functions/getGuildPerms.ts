import { PermissionFlagsBits } from '@discordjs/core';

import type { Cache } from '../Cache.js';
import { TimeoutDeniedPermissions } from '../Types/index.js';

export default async function (
 this: typeof Cache.prototype,
 guildId: string,
 userId: string,
): Promise<{ response: bigint; debug: number }> {
 const member = await this.members.get(guildId, userId);
 if (!member) return { response: 0n, debug: 4 };

 const guild = await this.guilds.get(guildId);
 if (!guild) return { response: 0n, debug: 8 };

 if (member.user_id === guild.owner_id) {
  return { response: PermissionFlagsBits.Administrator, debug: 9 };
 }

 const roles = await this.roles.getAll(guildId);
 if (!roles.length) return { response: 0n, debug: 10 };

 const everyoneRole = roles.find((r) => r.id === guildId);
 const memberRoles = roles.filter((r) => member.roles.includes(r.id));
 const allRoles = everyoneRole ? [everyoneRole, ...memberRoles] : memberRoles;
 let permissions = allRoles.reduce((acc, role) => acc | BigInt(role.permissions), 0n);

 if (new Date(member.communication_disabled_until || 0).getTime() > Date.now()) {
  const mask = TimeoutDeniedPermissions.reduce((acc, perm) => acc | perm, 0n);
  permissions = permissions & ~mask;
 }

 return { response: permissions, debug: 0 };
}
