import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {Bot} from "../../Bot";

export class FindPunishment extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "FIND_PUNISHMENT_COMMAND",
            formalCommandName: "Find Punishment Command",
            botCommandName: "findpunishment",
            description: "Finds punishment information when provided the punishment ID.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Moderation ID",
                    argName: "moderation_id",
                    desc: "The moderation ID to look up.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["ijwqbriouh2q9t4928ht3q8ghw"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const punishmentId = ctx.interaction.options.getString("moderation_id", true);
        const pInfo = await MongoManager.lookupPunishmentById(punishmentId);
        if (!pInfo) {
            await ctx.interaction.reply({
                content: `The moderation ID, \`${punishmentId}\`, was not found.`
            });
            return 0;
        }

        const [uMention, mMention, mResolvedMention, guild] = await Promise.all([
            GlobalFgrUtilities.fetchUser(pInfo.affectedUser.id),
            GlobalFgrUtilities.fetchUser(pInfo.moderator.id),
            GlobalFgrUtilities.fetchUser(pInfo.resolved?.moderator.id ?? ""),
            GlobalFgrUtilities.fetchGuild(pInfo.guildId)
        ]);

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!)
            .setTitle(
                pInfo.resolved?.actionId === punishmentId
                    ? `(Resolved) ${pInfo.moderationType} Information: ${pInfo.affectedUser.name}`
                    : `${pInfo.moderationType} Information: ${pInfo.affectedUser.name}`
            );


        // Let bot owners see all moderation history regardless of guild, but no one else
        if (pInfo.guildId !== ctx.guild!.id && !Bot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id)) {
            embed.setDescription(
                "You do not have permission to view this moderation information because this moderation action was"
                + " performed in a different server."
            );

            await ctx.interaction.reply({
                embeds: [embed]
            });

            return 0;
        }

        // Bot owner can see guild name in footer
        if (Bot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id)) {
            embed.setFooter({text: `Guild Name/ID: ${guild?.name ?? pInfo.guildId}`});
        }

        const punishmentObj = pInfo.resolved?.actionId === punishmentId
            ? pInfo.resolved
            : pInfo;

        const modMentionToUse = pInfo.resolved?.actionId === punishmentId
            ? mResolvedMention
            : mMention;

        const descSb = new StringBuilder();
        // We might not have all this info
        if (punishmentObj.affectedUser.id || punishmentObj.affectedUser.tag || punishmentObj.affectedUser.name) {
            descSb.append(`__**User Information**__ ${uMention ?? ""}`).appendLine();
            if (punishmentObj.affectedUser.id)
                descSb.append(`- User ID: ${punishmentObj.affectedUser.id}`).appendLine();
            if (punishmentObj.affectedUser.tag)
                descSb.append(`- User Tag: ${punishmentObj.affectedUser.tag}`).appendLine();
            if (punishmentObj.affectedUser.name)
                descSb.append(`- User Nickname: ${punishmentObj.affectedUser.name}`).appendLine();
        }

        // But we should have all this
        descSb.appendLine()
            .append(`__**Moderator Information**__ ${modMentionToUse ?? ""}`).appendLine()
            .append(`- Moderator ID: ${punishmentObj.moderator.id}`).appendLine()
            .append(`- Moderator Tag: ${punishmentObj.moderator.tag}`).appendLine()
            .append(`- Moderator Nickname: ${punishmentObj.moderator.name}`).appendLine();
        embed.setColor(pInfo.resolved?.actionId === punishmentId ? "GREEN" : "RED")
            .setDescription(descSb.toString()).addField(
                "Moderation ID",
                StringUtil.codifyString(punishmentObj.actionId)
            ).addField(
                "Issued At",
                StringUtil.codifyString(`${TimeUtilities.getDateTime(punishmentObj.issuedAt)} GMT`),
                true
            );

        // If this is a punishment, we also include duration, expiration time BEFORE the reason + evidence
        if (pInfo.actionId === punishmentId) {
            if (typeof pInfo.duration !== "undefined" && pInfo.duration !== -1) {
                embed.addField(
                    "Duration",
                    StringUtil.codifyString(TimeUtilities.formatDuration(pInfo.duration, true, false))
                );
            }

            if (typeof pInfo.expiresAt !== "undefined") {
                embed.addField(
                    "Expires At",
                    StringUtil.codifyString(
                        pInfo.expiresAt === -1
                            ? "Indefinite"
                            : `${TimeUtilities.getDateTime(pInfo.expiresAt)} GMT`
                    )
                );
            }
        }


        embed.addField("Reason", StringUtil.codifyString(punishmentObj.reason));
        if (punishmentObj.evidence.length > 0) {
            let i = 1;
            embed.addField("Evidence", punishmentObj.evidence.map(x => `[Evidence ${i++}](${x})`).join(", "));
        }

        // Include reference to either resolution ID or the original punishment mod ID
        if (pInfo.resolved?.actionId === punishmentId) {
            embed.addField(
                "Original Punishment",
                `The moderation ID of the original punishment is: ${StringUtil.codifyString(pInfo.actionId)}`
            );
        }
        else {
            if (pInfo.resolved) {
                embed.addField(
                    "Punishment Resolved",
                    `The moderation ID of the resolution is: ${StringUtil.codifyString(pInfo.resolved.actionId)}`
                );
            }
            else if (pInfo.moderationType !== "Warn") {
                embed.addField(
                    "Punishment Not Resolved",
                    "This punishment has not been resolved; it is still ongoing."
                );
            }
        }

        await ctx.interaction.reply({
            embeds: [embed]
        });
        return 0;
    }
}