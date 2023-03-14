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

    show() {
        return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Select an option".magenta);
                console.log("=".repeat(25).green);

                const { option } = await inquirer.prompt([
                    this.parse()
                ]);
                (this.choices[option - 1]).cb(option - 1);
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
        this.choices.push(new inquirer.Separator(text));
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
        logo("Not available yet".bgRed.cyan);
        await GoBack.show();
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

function enterToContinue() {
    return new Promise((resolve) => {
        console.log("\n");
        const input = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        input.question("Press enter to continue", () => {
            input.close();
            resolve();
        });
    });
}
exports.enterToContinue = enterToContinue;

function logo(extra) {
    console.clear();
    console.log([
        " _   _           _       _    _ _           _       ",
        "| \\ | |         | |     | |  | | |         | |      ",
        "|  \\| | ___   __| | ___ | |  | | |__   __ _| |_ ___ ",
        "| . ` |/ _ \\ / _` |/ _ \\| |/\\| | '_ \\ / _` | __/ __|",
        "| |\\  | (_) | (_| |  __/\\  /\\  / | | | (_| | |_\\__ \\",
        "\\_| \\_/\\___/ \\__,_|\\___| \\/  \\/|_| |_|\\__,_|\\__|___/",
        ""
    ].join("\n").red);

    if (extra) console.log(extra);
}
exports.logo = logo;

const { Sticker, StickerTypes } = require("wa-sticker-formatter");
exports.Sticker = Sticker;
exports.StickerTypes = StickerTypes;