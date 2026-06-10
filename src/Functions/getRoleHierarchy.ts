import type { Cache } from '../Cache.js';

export default async function (
 this: typeof Cache.prototype,
 guildId: string,
 executorId: string,
 targetId: string,
): Promise<{ response: boolean; debug: number }> {
 const executor = await this.members.get(guildId, executorId);
 if (!executor) return { response: false, debug: 4 };

 const target = await this.members.get(guildId, targetId);
 if (!target) return { response: false, debug: 5 };

 const guild = await this.guilds.get(guildId);
 if (!guild) return { response: false, debug: 8 };

 if (executor.user_id === guild.owner_id) return { response: true, debug: 9 };
 if (target.user_id === guild.owner_id) return { response: false, debug: 11 };

 const roles = await this.roles.getAll(guildId);
 if (!roles.length) return { response: false, debug: 10 };

 const targetRoles = roles.filter((r) => target.roles.includes(r.id));
 const executorRoles = roles.filter((r) => executor.roles.includes(r.id));

 const targetHighest = targetRoles.reduce(
  (highest, role) => (role.position > highest.position ? role : highest),
  { position: -1 } as { position: number },
 );

 return {
  response: executorRoles.some((role) => role.position > targetHighest.position),
  debug: 0,
 };
}
