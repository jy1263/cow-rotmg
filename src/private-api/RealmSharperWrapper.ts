import {Bot} from "../Bot";
import {PrivateApiDefinitions as PAD} from "./PrivateApiDefinitions";

export namespace RealmSharperWrapper {
    /**
     * Checks whether the online API is online. This should be called before any operations are done on the API.
     * @returns {Promise<boolean>} True if the API is online; false otherwise.
     */
    export async function isOnline(): Promise<boolean> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi + "/" + config.realmEyeApiLinks.pingOnline;
        try {
            const resp = await Bot.AxiosClient.get<PAD.IApiStatus>(url);
            return resp.data.online;
        } catch (e) {
            return false;
        }
    }

    /**
     * Gets the proper return type. This will return the correct type if data is available and null if not.
     * @param {PrivateApiDefinitions.IRealmEyePlayerResponse} resp The response data.
     * @returns {T | null} T if the data is available. Null otherwise.
     * @private
     */
    function getProperReturnType<T extends PAD.IRealmEyePlayerResponse>(resp: PAD.IRealmEyePlayerResponse): T | null {
        return !resp.profileIsPrivate && !resp.sectionIsPrivate ? resp as T : null;
    }

    /**
     * Gets the person's name history.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.INameHistory | null>} The person's name history, or null if the data
     * is private.
     */
    export async function getNameHistory(name: string): Promise<PAD.INameHistory | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.nameHistory
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.INameHistory>(url);
        return getProperReturnType<PAD.INameHistory>(resp.data);
    }

    /**
     * Gets the person's rank history.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IRankHistory | null>} The person's rank history, or null if the data
     * is private.
     */
    export async function getRankHistory(name: string): Promise<PAD.IRankHistory | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.rankHistory
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IRankHistory>(url);
        return getProperReturnType<PAD.IRankHistory>(resp.data);
    }

    /**
     * Gets the person's guild history.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IGuildHistory | null>} The person's guild history, or null if the data is
     * private.
     */
    export async function getGuildHistory(name: string): Promise<PAD.IGuildHistory | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.guildHistory
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IGuildHistory>(url);
        return getProperReturnType<PAD.IGuildHistory>(resp.data);
    }

    /**
     * Gets the person's exaltation statistics.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IExaltation | null>} The person's exaltation, or null if the data
     * is private.
     */
    export async function getExaltation(name: string): Promise<PAD.IExaltation | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.exaltations
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IExaltation>(url);
        return getProperReturnType<PAD.IExaltation>(resp.data);
    }

    /**
     * Gets the person's graveyard.
     * @param {string} name The name of the person to check.
     * @param {number} [amount = 1] The number of entries to fetch.
     * @returns {Promise<PrivateApiDefinitions.IGraveyard | null>} The person's graveyard, or null if the data is
     * private.
     */
    export async function getGraveyard(name: string, amount: number = 1): Promise<PAD.IGraveyard | null> {
        if (amount > 100) amount = 100;
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.graveyard
            + "?name=" + name + "&amt=" + amount;
        const resp = await Bot.AxiosClient.get<PAD.IGraveyard>(url);
        return getProperReturnType<PAD.IGraveyard>(resp.data);
    }

    /**
     * Gets the person's graveyard summary.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IGraveyardSummary | null>} The person's graveyard, or null if the
     * data is private.
     */
    export async function getGraveyardSummary(name: string): Promise<PAD.IGraveyardSummary | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.graveyardSummary
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IGraveyardSummary>(url);
        return getProperReturnType<PAD.IGraveyardSummary>(resp.data);
    }

    /**
     * Gets the person's pet yard data.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IPetYard | null>} The person's pet yard, or null if the data is private.
     */
    export async function getPetYard(name: string): Promise<PAD.IPetYard | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.petyard
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IPetYard>(url);
        return getProperReturnType<PAD.IPetYard>(resp.data);
    }

    /**
     * Gets the person's general player stats.
     * @param {string} name The name of the person to check.
     * @returns {Promise<PrivateApiDefinitions.IPlayerData | null>} The person's player stats, or null if the data
     * is empty.
     */
    export async function getPlayerInfo(name: string): Promise<PAD.IPlayerData | null> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.playerEndpoints.playerBasics
            + "?name=" + name;
        const resp = await Bot.AxiosClient.get<PAD.IPlayerData>(url);
        return getProperReturnType<PAD.IPlayerData>(resp.data);
    }

    /**
     * Parses a /who screenshot for names. This should only return an array of names.
     * @param {string} link The link to the screenshot.
     * @returns {Promise<PrivateApiDefinitions.IParseWhoResult>} An object containing parse results.
     */
    export async function parseWhoScreenshotOnly(link: string): Promise<PAD.IParseWhoResult> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.raidUtilEndpoints.parseOnlyEndpoint;
        const resp = await Bot.AxiosClient.post<PAD.IParseWhoResult>(url, {url: link}, {
            data: {url: link}
        });
        return resp.data;
    }

    /**
     * Parses a /who screenshot and returns an object containing a list of RealmEye data.
     * @param {string} link The link to the screenshot.
     * @returns {Promise<PrivateApiDefinitions.IParseJob>} An object containing parse results.
     */
    export async function parseWhoGetData(link: string): Promise<PAD.IParseJob> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.raidUtilEndpoints.parseAndRealmEyeEndpoint;
        const resp = await Bot.AxiosClient.post<PAD.IParseJob>(url, {
            data: {url: link}
        });
        return resp.data;
    }

    /**
     * Gets the RealmEye data for each name in the list concurrently.
     * @param {string[]} names The names.
     * @returns {Promise<PrivateApiDefinitions.IParseJob>} An object containing the parse results.
     */
    export async function getDataForAllNames(names: string[]): Promise<PAD.IParseJob> {
        const config = Bot.BotInstance.config;
        const url = config.realmEyeApiLinks.baseApi
            + "/" + config.realmEyeApiLinks.raidUtilEndpoints.dataForAllNamesEndpoint;
        const resp = await Bot.AxiosClient.post<PAD.IParseJob>(url, names);
        return resp.data;
    }
}