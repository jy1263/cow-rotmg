import {CommonRegex} from "../constants/CommonRegex";

export module UserFunctions {

    /**
     * Gets all names from a raw name. This will automatically remove any symbols.
     * @returns {Array<string>}
     */
    export function getAllNames(rawName: string): Array<string> {
        const parsedNames: Array<string> = [];
        const allNames = rawName.split("|")
            .map(x => x.trim())
            .filter(x => x.length != 0);

        for (const n of allNames) {
            const nameSplit = n.split("");
            while (nameSplit.length > 0) {
                // is letter
                if (nameSplit[0].toLowerCase() != nameSplit[0].toUpperCase())
                    break;
                nameSplit.shift();
            }

            let nameJoined = nameSplit.join("");
            if (CommonRegex.OnlyLetters.test(nameJoined))
                parsedNames.push(nameJoined);
        }

        return parsedNames;
    }
}