import { MessageType, PermissionFlagsBits } from '@discordjs/core';

export type MakeRequired<T, K extends keyof T> = T & {
 [P in K]-?: Exclude<T[P], null>;
};

export type UndeletableMessageType =
 | MessageType.Call
 | MessageType.ChannelIconChange
 | MessageType.ChannelNameChange
 | MessageType.RecipientAdd
 | MessageType.RecipientRemove
 | MessageType.ThreadStarterMessage;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const UndeletableMessageTypes: UndeletableMessageType[] = [
 MessageType.Call,
 MessageType.ChannelIconChange,
 MessageType.ChannelNameChange,
 MessageType.RecipientAdd,
 MessageType.RecipientRemove,
 MessageType.ThreadStarterMessage,
];

// eslint-disable-next-line @typescript-eslint/naming-convention
export const TimeoutDeniedPermissions: ReadonlyArray<bigint> = [
 PermissionFlagsBits.AddReactions,
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.ChangeNickname,
 PermissionFlagsBits.Connect,
 PermissionFlagsBits.CreateEvents,
 PermissionFlagsBits.CreateGuildExpressions,
 PermissionFlagsBits.CreatePrivateThreads,
 PermissionFlagsBits.CreatePublicThreads,
 PermissionFlagsBits.DeafenMembers,
 PermissionFlagsBits.KickMembers,
 PermissionFlagsBits.ManageChannels,
 PermissionFlagsBits.ManageEmojisAndStickers,
 PermissionFlagsBits.ManageEvents,
 PermissionFlagsBits.ManageGuild,
 PermissionFlagsBits.ManageGuildExpressions,
 PermissionFlagsBits.ManageMessages,
 PermissionFlagsBits.ManageNicknames,
 PermissionFlagsBits.ManageRoles,
 PermissionFlagsBits.ManageThreads,
 PermissionFlagsBits.ManageWebhooks,
 PermissionFlagsBits.ModerateMembers,
 PermissionFlagsBits.MoveMembers,
 PermissionFlagsBits.MuteMembers,
 PermissionFlagsBits.PinMessages,
 PermissionFlagsBits.SendMessagesInThreads,
 PermissionFlagsBits.UseApplicationCommands,
 PermissionFlagsBits.ViewAuditLog,
] as const;
