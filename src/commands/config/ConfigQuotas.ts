import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageSelectMenu,
    Role,
    TextChannel
} from "discord.js";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {IPropertyKeyValuePair, IQuotaInfo} from "../../definitions";
import {DUNGEON_DATA} from "../../constants/dungeons/DungeonData";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {askInput, sendOrEditBotMsg} from "./common/ConfigCommon";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {QuotaLogType, QuotaRunLogType, TimedResult, TimedStatus} from "../../definitions/Types";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {QuotaManager} from "../../managers/QuotaManager";
import {StringUtil} from "../../utilities/StringUtilities";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {MessageUtilities} from "../../utilities/MessageUtilities";

type QuotaAddResult = {
    quotaType: QuotaLogType;
    points: number;
};

type QuotaName = {
    key: QuotaLogType;
    name: string;
};

export class ConfigQuotas extends BaseCommand {
    public static MAX_QUOTAS_ALLOWED: number = 10;

    public static DAYS_OF_WEEK: [string, number][] = [
        ["Sunday", 0],
        ["Monday", 1],
        ["Tuesday", 2],
        ["Wednesday", 3],
        ["Thursday", 4],
        ["Friday", 5],
        ["Saturday", 6]
    ];

    // Update this when `pointValues` is updated.
    // Does NOT include any dungeons
    public static BASE_QUOTA_RECOGNIZED: QuotaName[] = [
        {
            name: "Parse Run",
            key: "Parse"
        },
        {
            name: "Manual Verify Member",
            key: "ManualVerify"
        },
        {
            name: "Punishment Issued",
            key: "PunishmentIssued"
        },
        {
            name: "Name Add/Change/Remove",
            key: "NameAdjustment"
        },
        {
            name: "Respond to Modmail",
            key: "ModmailRespond"
        }
    ];

    public constructor() {
        super({
            cmdCode: "CONFIG_QUOTAS_COMMAND",
            formalCommandName: "Config Quotas Command",
            botCommandName: "configquotas",
            description: "Allows you to configure quotas for one or more roles.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            generalPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        await this.mainMenu(ctx, null);
        return 0;
    }

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    public async mainMenu(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const buttons: MessageButton[] = [
            ButtonConstants.QUIT_BUTTON,
            new MessageButton()
                .setLabel("Set Reset Time")
                .setCustomId("reset_time")
                .setStyle("PRIMARY")
                .setEmoji(EmojiConstants.CLOCK_EMOJI)
        ];

        const resetInfo = ctx.guildDoc!.quotas.resetTime;
        const dayOfWeek = ConfigQuotas.DAYS_OF_WEEK[resetInfo.dayOfWeek][0];
        const seconds = resetInfo.time % 100;
        const timeReset = `${Math.floor(resetInfo.time / 100)}:${seconds < 10 ? "0" + seconds.toString() : seconds}`;
        const embed: MessageEmbed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Quota Configuration Command")
            .setDescription(
                "Here, you will be able to configure quotas for one or more roles. Select the appropriate option to"
                + " begin."
            ).addField(
                "Quit",
                "Click on the `Quit` button to exit this process."
            ).addField(
                "Set Reset Time",
                "Click on the `Set Reset Time` button to set the time when all quotas will reset. The current reset"
                + " time is:" + StringUtil.codifyString(`${dayOfWeek} at ${timeReset}`)
            );

        if (ctx.guildDoc!.quotas.quotaInfo.length + 1 < ConfigQuotas.MAX_QUOTAS_ALLOWED) {
            buttons.push(
                ButtonConstants.ADD_BUTTON
            );

            embed.addField(
                "Add Quota Configuration",
                "Click on the `Add` button to add a new quota."
            );
        }

        if (ctx.guildDoc!.quotas.quotaInfo.length > 0) {
            buttons.push(
                ButtonConstants.EDIT_BUTTON,
                ButtonConstants.REMOVE_BUTTON,
                ButtonConstants.RESET_BUTTON
            );

            embed.addField(
                "Edit Quota Configuration",
                "Click on the `Edit` button to edit an existing quota."
            ).addField(
                "Remove Quota Configuration",
                "Click on the `Remove` button to remove an existing quota."
            ).addField(
                "Reset Quotas",
                "Click on the `Reset` button to reset one or more quotas."
            );
        }

        botMsg = await sendOrEditBotMsg(ctx.channel!, botMsg, {
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents(buttons)
        });

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000
        });

        if (!selectedButton) {
            await this.dispose(ctx, botMsg);
            return;
        }

        // Asks the user to select a specific quota
        // Returns a role ID
        // Use in switch/case only
        async function selectQuota(instructions: string, max: number): Promise<TimedResult<string[]>> {
            await botMsg!.edit({
                embeds: [
                    new MessageEmbed()
                        .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                        .setTitle("Select Quota")
                        .setDescription(
                            new StringBuilder()
                                .append("__**Specific Directions**__").appendLine()
                                .append(instructions).appendLine(2)
                                .append("__**General Directions**__").appendLine()
                                .append("Please select a quota via the select menu below. If you decide that you do")
                                .append(" not want to select one at this time, press the **Back** button.")
                                .toString()
                        )
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.BACK_BUTTON,
                    new MessageSelectMenu()
                        .setCustomId("select")
                        .setMinValues(1)
                        .setMaxValues(Math.max(max, 1))
                        .addOptions(ctx.guildDoc!.quotas.quotaInfo.map(x => {
                            const role = GuildFgrUtilities.getCachedRole(ctx.guild!, x.roleId);
                            const channel = GuildFgrUtilities.getCachedChannel(ctx.guild!, x.channel);
                            return {
                                value: x.roleId,
                                label: `Quota: ${role?.name ?? `ID ${x.roleId}`}`,
                                description: `Leaderboard: ${channel?.name ?? `ID ${x.channel}`}`
                            };
                        }))
                ])
            });

            const selected = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg!.channel,
                targetAuthor: ctx.user,
                oldMsg: botMsg!,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 60 * 1000
            });

            if (!selected)
                return {value: null, status: TimedStatus.TIMED_OUT};

            if (!selected.isSelectMenu())
                return {value: null, status: TimedStatus.CANCELED};

            return {
                value: selected.values,
                status: TimedStatus.SUCCESS
            };
        }

        switch (selectedButton.customId) {
            case ButtonConstants.QUIT_ID: {
                await this.dispose(ctx, botMsg);
                return;
            }
            case "reset_time": {
                await botMsg!.edit({
                    embeds: [
                        new MessageEmbed()
                            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                            .setTitle("Specify Day of Week for Reset")
                            .setDescription(
                                "Select the day of the week that you want all quotas to reset at via the"
                                + " dropdown menu."
                            )
                    ],
                    components: AdvancedCollector.getActionRowsFromComponents([
                        new MessageSelectMenu()
                            .setMaxValues(1)
                            .setMinValues(1)
                            .setCustomId("day_of_week")
                            .addOptions(ConfigQuotas.DAYS_OF_WEEK.map(x => {
                                const [dayOfWeekStr, dayOfWeekNum] = x;
                                return {
                                    label: `${dayOfWeekStr} (${dayOfWeekNum})`,
                                    value: dayOfWeekNum.toString()
                                };
                            })),
                        ButtonConstants.CANCEL_BUTTON
                    ])
                });
                const resetDoWPrompt = await AdvancedCollector.startInteractionCollector({
                    targetChannel: botMsg!.channel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg!,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                    deleteBaseMsgAfterComplete: false,
                    duration: 45 * 1000
                });

                if (!resetDoWPrompt) {
                    await this.dispose(ctx, botMsg);
                    return;
                }

                if (!resetDoWPrompt.isSelectMenu())
                    break;

                await botMsg!.edit({
                    embeds: [
                        new MessageEmbed()
                            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                            .setTitle("Specify Time for Reset")
                            .setDescription(
                                new StringBuilder()
                                    .append("Specify the time that all quotas should reset. To do this, send a message")
                                    .append(" with the time, formatted like `hh:mm`, where:").appendLine()
                                    .append("- `hh` is the hour component and is between `0` and `23`").appendLine()
                                    .append("- `mm` is the minute component and is between `0` and `59`").appendLine(2)
                                    .append("For example, to represent 5:30 PM, you would type `17:30`. To represent")
                                    .append(" 12:00 AM, you would type `0:00`.")
                                    .toString()
                            )
                    ],
                    components: AdvancedCollector.getActionRowsFromComponents([
                        ButtonConstants.CANCEL_BUTTON
                    ])
                });

                const resetTimePrompt = await AdvancedCollector.startDoubleCollector<number>({
                    cancelFlag: null,
                    deleteResponseMessage: true,
                    targetChannel: botMsg!.channel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg!,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                    deleteBaseMsgAfterComplete: false,
                    duration: 45 * 1000
                }, m => {
                    if (!m.content.includes(":") || m.content.substring(m.content.indexOf(":") + 1).length === 0)
                        return;

                    const [hr, min] = m.content.split(":").map(x => Number.parseInt(x, 10));
                    if (Number.isNaN(hr) || hr < 0 || hr > 23)
                        return;

                    if (Number.isNaN(min) || min < 0 || min > 59)
                        return;

                    return hr * 100 + min;
                });

                if (!resetTimePrompt) {
                    await this.dispose(ctx, botMsg);
                    return;
                }

                if (resetTimePrompt instanceof MessageComponentInteraction)
                    break;

                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                    $set: {
                        "quotas.resetTime.dayOfWeek": Number.parseInt(resetDoWPrompt.values[0], 10),
                        "quotas.resetTime.time": resetTimePrompt
                    }
                });

                break;
            }
            case ButtonConstants.ADD_ID: {
                await this.addOrEditQuota(ctx, botMsg);
                return;
            }
            case ButtonConstants.EDIT_ID: {
                const quotaToEdit = await selectQuota(
                    "Please select **one** quota that you want to modify.",
                    1
                );

                if (quotaToEdit.status === TimedStatus.CANCELED)
                    break;

                if (quotaToEdit.status === TimedStatus.TIMED_OUT) {
                    await this.dispose(ctx, botMsg);
                    return;
                }

                await this.addOrEditQuota(
                    ctx,
                    botMsg,
                    ctx.guildDoc!.quotas.quotaInfo.find(x => x.roleId === quotaToEdit.value![0])!
                );
                return;
            }
            case ButtonConstants.REMOVE_ID: {
                const quotaToRemove = await selectQuota(
                    "Please select **one** quota that you want to remove.",
                    1
                );

                if (quotaToRemove.status === TimedStatus.CANCELED)
                    break;

                if (quotaToRemove.status === TimedStatus.TIMED_OUT) {
                    await this.dispose(ctx, botMsg);
                    return;
                }

                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                    $pull: {
                        "quotas.quotaInfo": {
                            roleId: quotaToRemove.value![0]
                        }
                    }
                });
                break;
            }
            case ButtonConstants.RESET_ID: {
                const quotasToReset = await selectQuota(
                    "Please select the quota(s) that you want to reset.",
                    ctx.guildDoc!.quotas.quotaInfo.length
                );

                if (quotasToReset.status === TimedStatus.CANCELED)
                    break;

                if (quotasToReset.status === TimedStatus.TIMED_OUT) {
                    await this.dispose(ctx, botMsg);
                    return;
                }

                await Promise.all(quotasToReset.value!.map(roleId => QuotaManager.resetQuota(ctx.guild!, roleId)));
                break;
            }
        }

        await this.mainMenu(ctx, botMsg);
    }

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async dispose(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        if (botMsg) {
            await MessageUtilities.tryDelete(botMsg);
        }
    }

    /**
     * Adds or edits a quota.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IQuotaInfo} [quotaInfo] The quota, if any. If no quota is specified, a new one will be created.
     * @return {Promise<void>}
     * @private
     */
    private async addOrEditQuota(ctx: ICommandContext, botMsg: Message, quotaInfo?: IQuotaInfo): Promise<void> {
        const allActiveDungeonIds = new Set<string>(
            DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons).map(x => x.codeName)
        );

        const quotaToEdit: IQuotaInfo = quotaInfo ?? {
            roleId: "",
            lastReset: Date.now(),
            quotaLog: [],
            channel: "",
            messageId: "",
            pointsNeeded: 10,
            pointValues: []
        };

        quotaToEdit.pointValues = quotaToEdit.pointValues.filter(x => {
            if (!x.key.includes(":"))
                return true;
            return allActiveDungeonIds.has(x.key.split(":")[1]);
        });

        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Quota Configuration")
            .setDescription(
                new StringBuilder()
                    .append("- To set the role for this quota, press the **Set Role** button.").appendLine()
                    .append("- To set the channel where the leaderboard should be posted, press the **Set Channel**")
                    .append(" button.").appendLine()
                    .append("- To set the minimum number of points needed to complete this quota, press the **Set")
                    .append(" Minimum Points** button.").appendLine()
                    .append("- To configure what actions give points, press the **Configure Points** button.")
                    .appendLine()
                    .append("- To save your changes to the database, press the **Save** button. Otherwise, press the")
                    .append(" **Quit** or **Back** button.")
                    .toString()
            );

        const saveButton = AdvancedCollector.cloneButton(ButtonConstants.SAVE_BUTTON);

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            new MessageButton()
                .setLabel("Set Role")
                .setCustomId("set_role")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Channel")
                .setCustomId("set_channel")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Minimum Points")
                .setCustomId("set_min_pts")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Configure Points")
                .setCustomId("config_pts")
                .setStyle("PRIMARY"),
            saveButton,
            ButtonConstants.QUIT_BUTTON
        ];

        while (true) {
            const role = await GuildFgrUtilities.fetchRole(ctx.guild!, quotaToEdit.roleId);
            saveButton.setDisabled(!role);

            const channel = GuildFgrUtilities.getCachedChannel(ctx.guild!, quotaToEdit.channel);
            embed.fields = [];
            embed.addField(
                "Current Role",
                role?.toString() ?? "Not Set.",
                true
            ).addField(
                "Current Channel",
                channel?.toString() ?? "Not Set.",
                true
            ).addField(
                "Minimum Points Needed",
                `${quotaToEdit.pointsNeeded} Points Needed`,
                true
            ).addField(
                "Point Rules Set",
                `${quotaToEdit.pointValues.length} Values Set`
            );

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedButton = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                acknowledgeImmediately: true,
                deleteBaseMsgAfterComplete: false,
                duration: 2 * 60 * 1000
            });

            if (!selectedButton) {
                await this.dispose(ctx, botMsg);
                return;
            }

            switch (selectedButton.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
                case "set_role": {
                    const r = await askInput<Role>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Role for Quota")
                                    .setDescription(
                                        `Current Role: ${role ?? "Not Set"}\n\nPlease mention, or type the ID of, the`
                                        + " the role that you want to link with this quota. This role must __not__ be"
                                        + " used for other quotas; specifying an already used role will result in an"
                                        + " error. If you don't want to set a role at this time, press the **Back**"
                                        + " button."
                                    )
                            ]
                        },
                        m => {
                            const roleToUse = ParseUtilities.parseRole(m);
                            if (!roleToUse)
                                return null;
                            return ctx.guildDoc!.quotas.quotaInfo.some(x => x.roleId === roleToUse.id)
                                ? null
                                : roleToUse;
                        }
                    );

                    if (typeof r === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!r) {
                        break;
                    }

                    quotaToEdit.roleId = r.id;
                    break;
                }
                case "set_channel": {
                    const c = await askInput<TextChannel>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Channel for Quota")
                                    .setDescription(
                                        `Current Channel: ${channel ?? "Not Set"}\n\nPlease mention, or type the ID of,`
                                        + " the __text channel__ that you want to link with this quota. This channel"
                                        + " will be used for the quota leaderboard. If you decide that you don't"
                                        + " want to set a channel up, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const channelToUse = ParseUtilities.parseChannel(m);
                            if (!channelToUse || !(channelToUse instanceof TextChannel))
                                return null;
                            return channelToUse;
                        }
                    );

                    if (typeof c === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!c) {
                        break;
                    }

                    quotaToEdit.channel = c.id;
                    break;
                }
                case "set_min_pts": {
                    const n = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Minimum Points Needed for Quota")
                                    .setDescription(
                                        `Current Minimum Points: ${quotaToEdit.pointsNeeded}\n\nType a positive number`
                                        + " that you want to make the minimum number of points needed to pass the"
                                        + " weekly quota. If you don't want to set this up, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const num = Number.parseInt(m.content, 10);
                            return Number.isNaN(num) || num <= 0 ? null : num;
                        }
                    );

                    if (typeof n === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!n) {
                        break;
                    }

                    quotaToEdit.pointsNeeded = n;
                    break;
                }
                case "config_pts": {
                    const r = await this.editQuotaPointConfig(ctx, botMsg, quotaToEdit.pointValues);
                    if (r.status === TimedStatus.CANCELED)
                        break;

                    if (r.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    quotaToEdit.pointValues = r.value!;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    if (quotaInfo) {
                        await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                            $pull: {
                                "quotas.quotaInfo": {
                                    roleId: quotaInfo.roleId
                                }
                            }
                        });
                    }

                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                        $push: {
                            "quotas.quotaInfo": quotaToEdit
                        }
                    });

                    await this.mainMenu(ctx, botMsg);
                    return;
                }
            }
        } // end while
    }

    /**
     * Allows the user to edit the current quota system. The user will be able to:
     * - Add a quota rule.
     * - Remove a quota rule.
     * - Edit the quota rule's points.
     *
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IPropertyKeyValuePair<QuotaLogType, number>[]} pts The current quotas.
     * @return {Promise<TimedResult<IPropertyKeyValuePair<QuotaLogType, number>[]>>} The result, if any.
     * @private
     */
    private async editQuotaPointConfig(
        ctx: ICommandContext,
        botMsg: Message,
        pts: IPropertyKeyValuePair<QuotaLogType, number>[]
    ): Promise<TimedResult<IPropertyKeyValuePair<QuotaLogType, number>[]>> {
        const ptsToUse = pts.slice().filter(x => {
            if (!x.key.startsWith("Run"))
                return true;

            const logAndId = x.key.split(":");
            if (logAndId.length === 1)
                return true;
            return DungeonUtilities.isCustomDungeon(logAndId[1])
                ? ctx.guildDoc!.properties.customDungeons.some(dgn => dgn.codeName === logAndId[1])
                : DUNGEON_DATA.some(dgn => dgn.codeName === logAndId[1]);
        });
        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Modify Point Values")
            .setDescription(
                new StringBuilder()
                    .append("Here, you can configure how many points specific actions are worth. **Keep in mind**")
                    .append(" that editing the quota system when people have already logged quotas may result in")
                    .append(" earned points being lost forever.")
                    .appendLine(2)
                    .append(`The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected`)
                    .append(" point rule.")
                    .appendLine()
                    .append("- You can move this arrow up or down by either pressing the Up/Down button, or by using")
                    .append(" the jump (`j`) command. For example, to move the arrow down 2, send `j 2`. To move the")
                    .append(" arrow up 4, send `j -4`.")
                    .appendLine()
                    .append("- If you want to remove the selected rule, press the **Remove** button.")
                    .appendLine()
                    .append("- If you want to modify how many points the selected rule is worth, simply type a non-")
                    .append(" negative __integer__.")
                    .appendLine()
                    .append("- If needed, you can add a new rule; to do so, press the **Add** button.")
                    .appendLine()
                    .append("- Once you're done, press the **Save** button to save your changes.")
                    .appendLine()
                    .append("- Alternatively, you can either press **Back** if you want to go back to the previous")
                    .append(" option or press the **Quit** button to quit this entire process. In either case, your")
                    .append(" changes will definitely not be saved.")
                    .toString()
            );

        const upButton = AdvancedCollector.cloneButton(ButtonConstants.UP_BUTTON);
        const saveButton = AdvancedCollector.cloneButton(ButtonConstants.SAVE_BUTTON);
        const addButton = AdvancedCollector.cloneButton(ButtonConstants.ADD_BUTTON);
        const downButton = AdvancedCollector.cloneButton(ButtonConstants.DOWN_BUTTON);
        const removeButton = AdvancedCollector.cloneButton(ButtonConstants.REMOVE_BUTTON);

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            addButton,
            upButton,
            downButton,
            removeButton,
            ButtonConstants.QUIT_BUTTON,
            saveButton
        ];

        let currIdx = 0;
        while (true) {
            const allPossChoices = this.getQuotasToAdd(ptsToUse);
            addButton.setDisabled(
                ptsToUse.length + 1 > ConfigQuotas.MAX_QUOTAS_ALLOWED || allPossChoices.length === 0
            );
            removeButton.setDisabled(ptsToUse.length === 0);
            upButton.setDisabled(ptsToUse.length <= 1);
            downButton.setDisabled(ptsToUse.length <= 1);
            embed.fields = [];
            const fields = ArrayUtilities.arrayToStringFields(ptsToUse, (i, elem) => {
                if (elem.key.startsWith("Run")) {
                    const logTypeAndDgnId = elem.key.split(":");
                    const logType = logTypeAndDgnId[0];
                    if (logTypeAndDgnId.length === 1) {
                        const tempS = `${QuotaManager.ALL_QUOTAS_KV[logType]} (All): \`${elem.value}\` Points\n`;
                        return i === currIdx
                            ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${tempS}`
                            : tempS;
                    }

                    const dungeonName = DungeonUtilities.getDungeonInfo(logTypeAndDgnId[1], ctx.guildDoc!)!.dungeonName;
                    const s = `${QuotaManager.ALL_QUOTAS_KV[logType]} (${dungeonName}): \`${elem.value}\` Points\n`;
                    return i === currIdx
                        ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${s}`
                        : s;
                }

                const mainS = `${QuotaManager.ALL_QUOTAS_KV[elem.key]}: \`${elem.value}\` Points\n`;
                return i === currIdx
                    ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${mainS}`
                    : mainS;
            });

            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedRes = await AdvancedCollector.startDoubleCollector<string>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 60 * 1000,
                cancelFlag: null,
                deleteResponseMessage: true
            }, AdvancedCollector.getStringPrompt(ctx.channel));

            if (!selectedRes) {
                await this.dispose(ctx, botMsg);
                continue;
            }

            if (typeof selectedRes === "string") {
                const splitRes = selectedRes.split(" ");
                if (splitRes.length === 0)
                    continue;

                const num = Number.parseInt(splitRes.at(-1)!, 10);
                if (Number.isNaN(num))
                    continue;

                // len == 1 means new value
                if (splitRes.length === 1) {
                    if (num > 0)
                        ptsToUse[currIdx].value = num;
                    continue;
                }

                if (ptsToUse.length === 0)
                    continue;
                currIdx += num;
                currIdx %= ptsToUse.length;
                continue;
            }

            switch (selectedRes.customId) {
                case ButtonConstants.UP_ID: {
                    currIdx = (currIdx + ptsToUse.length - 1) % ptsToUse.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    currIdx++;
                    currIdx %= ptsToUse.length;
                    break;
                }
                case ButtonConstants.ADD_ID: {
                    const r = await this.addNewQuota(ctx, botMsg, ptsToUse);
                    if (r.status === TimedStatus.TIMED_OUT)
                        return {status: TimedStatus.TIMED_OUT, value: null};
                    if (r.status === TimedStatus.CANCELED)
                        return {status: TimedStatus.CANCELED, value: null};

                    if (r.value!.quotaType.startsWith("Run")) {
                        const runType = r.value!.quotaType.split(":")[0];
                        // If the new quota log type has a specific dungeon, remove dungeon run general quota log types
                        if (r.value!.quotaType.includes(":")) {
                            for (let i = ptsToUse.length - 1; i >= 0; i--) {
                                if (ptsToUse[i].key.startsWith(runType) && !ptsToUse[i].key.includes(":")) {
                                    ptsToUse.splice(i, 1);
                                }
                            }
                        }

                        // If the new quota log type does not have a specific dungeon, remove dungeon run quota log
                        // types w/ said specific dungeon
                        else {
                            for (let i = ptsToUse.length - 1; i >= 0; i--) {
                                if (ptsToUse[i].key.startsWith(runType) && ptsToUse[i].key.includes(":")) {
                                    ptsToUse.splice(i, 1);
                                }
                            }
                        }
                    }

                    ptsToUse.push({
                        key: r.value!.quotaType,
                        value: r.value!.points
                    });

                    if (ptsToUse.length > 0)
                        currIdx = 0;
                    break;
                }
                case ButtonConstants.REMOVE_ID: {
                    ptsToUse.splice(currIdx, 1);
                    break;
                }
                case ButtonConstants.BACK_ID: {
                    return {value: pts, status: TimedStatus.SUCCESS};
                }
                case ButtonConstants.SAVE_ID: {
                    return {value: ptsToUse, status: TimedStatus.SUCCESS};
                }
                case ButtonConstants.QUIT_ID: {
                    return {value: null, status: TimedStatus.CANCELED};
                }
            }
        }
    }

    /**
     * Gets all quotas that can be added to this quota collection.
     * @param {IPropertyKeyValuePair<QuotaLogType, number>[]} currentSet The current quotas.
     * @return {QuotaName[]} The quota log types, along with the associated name, that can be added.
     * @private
     */
    private getQuotasToAdd(currentSet: IPropertyKeyValuePair<QuotaLogType, number>[]): QuotaName[] {
        const res: QuotaName[] = [];

        const runCompleteIdx = currentSet.findIndex(x => x.key.startsWith("RunComplete"));
        // If no RunComplete config exists, then we offer to add this config for one or all dungeons.
        // Likewise, if RunConfig config does exist but it's for a specific option, then we offer to add this config
        // for one (i.e. add a config for a different dungeon) or all dungeons (removing the dungeon-specific config).
        // Same idea for the next few branches.
        if (runCompleteIdx === -1 || currentSet[runCompleteIdx].key.includes(":")) {
            res.push(
                {
                    name: "Run Complete (Specific Dungeon)",
                    key: "RunComplete:*"
                },
                {
                    name: "Run Complete (All Dungeons)",
                    key: "RunComplete"
                }
            );
        }
        else {
            res.push({
                name: "Run Complete (Specific Dungeon)",
                key: "RunComplete:*"
            });
        }


        const runFailedIdx = currentSet.findIndex(x => x.key.startsWith("RunFailed"));
        if (runFailedIdx === -1 || currentSet[runFailedIdx].key.includes(":")) {
            res.push(
                {
                    name: "Run Failed (Specific Dungeon)",
                    key: "RunFailed:*"
                },
                {
                    name: "Run Failed (All Dungeons)",
                    key: "RunFailed"
                }
            );
        }
        else {
            res.push({
                name: "Run Failed (Specific Dungeon)",
                key: "RunFailed:*"
            });
        }

        const runAssistIdx = currentSet.findIndex(x => x.key.startsWith("RunAssist"));
        if (runAssistIdx === -1 || currentSet[runAssistIdx].key.startsWith(":")) {
            res.push(
                {
                    name: "Run Assist (Specific Dungeon)",
                    key: "RunAssist:*"
                },
                {
                    name: "Run Assist (All Dungeons)",
                    key: "RunAssist"
                }
            );
        }
        else {
            res.push({
                name: "Run Assist (Specific Dungeon)",
                key: "RunAssist:*"
            });
        }

        for (const q of ConfigQuotas.BASE_QUOTA_RECOGNIZED) {
            if (currentSet.some(x => x.key === q.key))
                continue;
            res.push(q);
        }

        return res;
    }

    /**
     * Runs a wizard that lets the user add a new quota to the collection.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IPropertyKeyValuePair<QuotaLogType, number>[]} currentSet The current quotas.
     * @return {Promise<QuotaAddResult>} The quota to add.
     * @private
     */
    private async addNewQuota(
        ctx: ICommandContext,
        botMsg: Message,
        currentSet: IPropertyKeyValuePair<QuotaLogType, number>[]
    ): Promise<TimedResult<QuotaAddResult>> {
        await botMsg.edit({
            embeds: [
                new MessageEmbed()
                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                    .setTitle("Add New Quota Rule")
                    .setDescription(
                        "Please select, from the select menu, the quota rule that you want to add to this quota. If"
                        + " you don't want to add one at this time, press the **Back** button."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setCustomId("select")
                    .addOptions(this.getQuotasToAdd(currentSet).map(x => {
                        return {
                            label: x.name,
                            value: x.key
                        };
                    })),
                ButtonConstants.CANCEL_BUTTON
            ])
        });
        const selectedInt = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel as TextChannel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 30 * 1000
        });

        if (!selectedInt)
            return {value: null, status: TimedStatus.TIMED_OUT};
        if (!selectedInt.isSelectMenu())
            return {value: null, status: TimedStatus.CANCELED};

        const selectedQuotaType = selectedInt.values[0] as QuotaLogType;
        let finalQuotaType: QuotaLogType = selectedQuotaType;
        // Case if this is a specific dungeon
        if (selectedQuotaType.startsWith("Run") && selectedQuotaType.includes(":")) {
            const logType: QuotaRunLogType = selectedQuotaType.split(":")[0] as QuotaRunLogType;
            const currentDungeons = currentSet.filter(x => x.key.startsWith(`${logType}:`))
                .map(x => x.key.split(":")[1]);
            const allDungeons = DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons)
                .filter(x => !currentDungeons.includes(x.codeName));

            const fields = ArrayUtilities.arrayToStringFields(
                allDungeons,
                (i, d) => {
                    const emoji = GlobalFgrUtilities.getCachedEmoji(d.portalEmojiId);
                    let finalStr = `\`[${i + 1}]\` `;
                    if (emoji)
                        finalStr += `${emoji} `;
                    finalStr += `${d.dungeonName} ${d.isBuiltIn ? "" : "(Custom)"}\n`;
                    return finalStr;
                }
            );

            await botMsg.edit({
                embeds: [
                    new MessageEmbed()
                        .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                        .setTitle("Select Dungeon")
                        .setDescription(
                            "Please select **one** dungeon from the list of dungeons below. Afterwards, you will"
                            + " be asked to assign a point value to this dungeon, which then can be used for"
                            + " quota logging. If you don't want to add a dungeon, press the **Cancel** button."
                        ).setFields(fields.map(x => {
                            return {name: GeneralConstants.ZERO_WIDTH_SPACE, value: x};
                        }))
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.CANCEL_BUTTON
                ])
            });

            const resNum = await AdvancedCollector.startDoubleCollector<number>({
                cancelFlag: null,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 2 * 60 * 1000,
                oldMsg: botMsg,
                targetAuthor: ctx.user,
                targetChannel: ctx.channel
            }, AdvancedCollector.getNumberPrompt(ctx.channel, {min: 1, max: allDungeons.length + 1}));

            if (!resNum)
                return {value: null, status: TimedStatus.TIMED_OUT};
            if (resNum instanceof MessageComponentInteraction)
                return {value: null, status: TimedStatus.CANCELED};
            finalQuotaType = `${logType}:${allDungeons[resNum - 1].codeName}`;
        }

        // Now we need a value
        await botMsg.edit({
            embeds: [
                new MessageEmbed()
                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                    .setTitle("Select Value")
                    .setDescription(
                        "Please type a  __positive whole number__ between 1 and 500 (inclusive). This will represent"
                        + " the number of points that this particular log type will contribute to the person's"
                        + " overall quota score. If you don't want to specify one, press the **Cancel** button."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        const resPts = await AdvancedCollector.startDoubleCollector<number>({
            cancelFlag: null,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            deleteResponseMessage: true,
            duration: 2 * 60 * 1000,
            oldMsg: botMsg,
            targetAuthor: ctx.user,
            targetChannel: ctx.channel
        }, AdvancedCollector.getNumberPrompt(ctx.channel, {min: 1, max: 500}));

        if (!resPts)
            return {value: null, status: TimedStatus.TIMED_OUT};
        if (resPts instanceof MessageComponentInteraction)
            return {value: null, status: TimedStatus.CANCELED};
        return {
            status: TimedStatus.SUCCESS,
            value: {
                quotaType: finalQuotaType,
                points: resPts
            }
        };
    }
}