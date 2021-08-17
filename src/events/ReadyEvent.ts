import {OneLifeBot} from "../OneLifeBot";
import {MongoManager} from "../managers/MongoManager";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {IBotInfo} from "../definitions";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";

export async function onReadyEvent(): Promise<void> {
    const botUser = OneLifeBot.BotInstance.client.user;

    // This should theoretically never hit.
    if (!botUser) {
        console.error("Bot user not instantiated.");
        process.exit(1);
    }

    // If mongo isn't connected, then we can't really use the bot.
    if (!MongoManager.isConnected()) {
        console.error("Mongo isn't connected! Unable to use bot. Shutting down.");
        process.exitCode = 1;
        return;
    }

    // If the bot doc isn't in the database, then we add it.
    const thisBotCollection = await MongoManager.getBotCollection()
        .findOne({clientId: botUser.id});

    if (!thisBotCollection) {
        const newCollectionObj: IBotInfo = {
            activeEvents: [],
            clientId: botUser.id
        };

        await MongoManager.getBotCollection().insertOne(newCollectionObj);
    }

    // Now, we want to add any guild docs to the database <=> the guild isn't in the database.
    const botGuilds = OneLifeBot.BotInstance.client.guilds.cache;
    await Promise.all(OneLifeBot.BotInstance.client.guilds.cache.map(async x => {
        if (OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(x.id))
            return null;
        await MongoManager.getOrCreateGuildDoc(x.id, false);
    }));

    const guildDocs = await MongoManager.getGuildCollection().find({}).toArray();
    await Promise.all([MuteManager.startChecker(guildDocs), SuspensionManager.startChecker(guildDocs)]);

    const readyLog = new StringBuilder()
        .append(`${botUser.tag} has started successfully.`)
        .appendLine()
        .append(`Time: ${MiscUtilities.getTime()}`);

    console.info(readyLog.toString());
}