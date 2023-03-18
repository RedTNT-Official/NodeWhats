const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const interruptedPrompt = require("inquirer-interrupted-prompt");
const { createInterface } = require("readline");
const { pluginsMenu } = require("../pluginManager/pluginsInstaller");
const PasswordPrompt = require("inquirer/lib/prompts/password");
const InputPrompt = require("inquirer/lib/prompts/input");
const ListPrompt = require("inquirer/lib/prompts/list");
const { Client } = require("./socket");
const inquirer = require("inquirer");
require("colors");

const prefix = ".";
exports.prefix = prefix;

const CommandRegistry = new Map();
exports.CommandRegistry = CommandRegistry;

const client = new Client({
    shouldReconnect: true
});
exports.client = client;

client.on("error", (err) => {
    console.error(err.red);
});

class Command {
    name;
    description;
    admin;
    cb;

    constructor(name, description, cb, permissions) {
        this.name = name;
        this.description = description;
        this.cb = cb;
        this.admin = permissions === CommandPermissionLevel.Admin;
    }

    alias(name) {
        CommandRegistry.set(name.toLowerCase(), this);
        return this;
    }

    static register(name, description, cb, permissions = CommandPermissionLevel.Normal) {
        if (CommandRegistry.has(name.toLowerCase())) throw new Error("Command already registered");

        const command = new Command(name, description, cb, permissions);
        CommandRegistry.set(name.toLowerCase(), command);
        return command;
    }

    static find(name) {
        return CommandRegistry.get(name);
    }

    overwrite(cb) {
        this.cb = cb;
        CommandRegistry.set(this.name.toLowerCase(), this);
    };
}
exports.Command = Command;

var CommandPermissionLevel = {
    "Normal": 0,
    "Admin": 1,
    0: "Normal",
    1: "Admin"
}

inquirer.registerPrompt("intr-list", interruptedPrompt.from(ListPrompt));
inquirer.registerPrompt("intr-input", interruptedPrompt.from(InputPrompt));
inquirer.registerPrompt("intr-password", interruptedPrompt.from(PasswordPrompt));

class Menu {
    title;
    type;
    /**
     * @type { (Choice | inquirer.Separator)[] }
     */
    choices;
    originalLength;
    itrCallback;

    constructor(title, type, choices = [], itrCallback) {
        this.title = title;
        this.type = itrCallback ? `intr-${type}` : type;
        this.choices = choices;
        this.originalLength = choices?.length || 0;
        this.itrCallback = itrCallback;
    }

    /**
     * 
     * @param { boolean } clear
     * @returns { Promise<number> }
     */
    show(clear) {
        if (clear) logo();
        if (!client.terminal) return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Select an option".magenta);
                console.log("=".repeat(25).green);

                const noSeparators = this.choices.filter(c => {
                    if (c instanceof inquirer.Separator) return false;
                    return true;
                });

                let i = 1;

                for (let choice of this.choices) {
                    if (choice instanceof inquirer.Separator) {
                        console.log(choice.line);
                        continue;
                    }
                    console.log(`${i}) ${choice.name}`);
                    i++;
                }

                const line = createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                line.question("Write an option number", (output) => {
                    console.log(this.itrCallback);
                    if (this.itrCallback && /return|exit|back/.exec(output.trim().toLowerCase())) return this.itrCallback();
                    const option = Number(output.trim());

                    const choice = noSeparators[option - 1];

                    if (!choice) {
                        line.close();
                        return this.show(true);
                    }

                    if (isNaN(option)) {
                        logo("Wrong input".red);
                        line.close();
                        return this.show(true);
                    }

                    line.close();
                    if (choice.cb) choice.cb(option - 1);
                    resolve(option - 1);
                });

            } catch (e) {
                if (e !== interruptedPrompt.EVENT_INTERRUPTED) return;

                this.itrCallback();
            }
        });

        return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Select an option".magenta);
                console.log("=".repeat(25).green);

                const { option } = await inquirer.prompt([
                    this.parse()
                ]);
                const choice = this.choices[option - 1];
                if (choice.cb) choice.cb(option - 1);
                resolve(option - 1);
            } catch (e) {
                if (e !== interruptedPrompt.EVENT_INTERRUPTED) return;

                this.itrCallback();
            }
        });
    }

    addChoice(choice) {
        this.choices.push(choice);
        return this;
    }

    addSeparator(text) {
        if (!client.terminal) this.choices.push("───────────────");
        else this.choices.push(new inquirer.Separator(text || "───────────────"));
        return this;
    }

    resetChoices() {
        this.choices = this.choices.slice(0, this.originalLength);
    }

    parse() {
        return {
            type: this.type,
            name: "option",
            message: this.title,
            choices: [
                new inquirer.Separator(),
                ...this.choices.map((choice, index) => {
                    if (choice instanceof inquirer.Separator) return choice;
                    return {
                        name: choice.name,
                        value: index + 1
                    }
                })
            ]
        }
    }
}
exports.Menu = Menu;

class Choice {
    name;
    /**
     * @type { () => void }
     */
    cb;

    constructor(name, cb) {
        this.name = name;
        this.cb = cb || (() => { });
    }
}
exports.Choice = Choice;

const MainMenu = new Menu("Main Menu", "list", [
    new Choice("Search Plugins", () => {
        pluginsMenu();
    }),
    new Choice("Reload Plugins", async () => {
        const { loadCommands, reloadPlugins } = require("../Utils");
        logo();
        await loadCommands();
        await reloadPlugins();
        await enterToContinue();
        logo();
        MainMenu.show();
    }),
    new Choice("About", async () => {
        logo([
            `Made by: ${"RedTNT".cyan}`.yellow,
            `Discord: ${"RedTNT#0333".cyan}`.yellow,
            `GitHub: ${"https://github.com/RedTNT-Official".cyan}`.yellow
        ].join("\n"));
        await enterToContinue();
        logo();
        MainMenu.show();
    }),
    new Choice("Stop", async () => {
        logo("Turning off...".red);
        client.destroy();
        process.exit();
    })
]);
exports.MainMenu = MainMenu;

const GoBack = new Menu("Actions", "list", [new Choice("Go Back")]);
exports.GoBack = GoBack;

/**
 * 
 * @returns { Promise<string> }
 */
function enterToContinue() {
    return new Promise((resolve) => {
        console.log(" \n");
        const input = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        console.log("Press enter to continue");
        input.question(" ", (response) => {
            input.close();
            resolve(response.trim().toLowerCase());
        });
    });
}
exports.enterToContinue = enterToContinue;

function logo(extra) {
    console.clear();
    console.log([
        " _   _           _       _    _ _           _       ".red,
        "| \\ | |         | |     | |  | | |         | |      ".red,
        "|  \\| | ___   __| | ___ | |  | | |__   __ _| |_ ___ ".red,
        "| . ` |/ _ \\ / _` |/ _ \\| |/\\| | '_ \\ / _` | __/ __|".red,
        "| |\\  | (_) | (_| |  __/\\  /\\  / | | | (_| | |_\\__ \\".red,
        "\\_| \\_/\\___/ \\__,_|\\___| \\/  \\/|_| |_|\\__,_|\\__|___/".red,
        " "
    ].join("\n"));

    if (extra) console.log(extra);
}
exports.logo = logo;

exports.Sticker = Sticker;
exports.StickerTypes = StickerTypes;