import { Client, Message, User } from "./socket";
// @ts-ignore
import interruptedPrompt from "inquirer-interrupted-prompt";
import { createInterface } from "readline";
import { pluginsMenu } from "../pluginManager/pluginsInstaller";
import PasswordPrompt from "inquirer/lib/prompts/password";
import InputPrompt from "inquirer/lib/prompts/input";
import ListPrompt from "inquirer/lib/prompts/list";
import inquirer from "inquirer";
import "colors";

export const prefix = ".";
export const CommandRegistry = new Map<string, Command>();

export const client = new Client({
    shouldReconnect: true
});

client.on("error", (err) => {
    console.error(err.red);
});

export class Command {
    name: string;
    description: string;
    admin: boolean;
    cb: (user: User, message: Message, args: string[]) => void;

    constructor(name: string, description: string, cb: Command["cb"], permissions: CommandPermissionLevel) {
        this.name = name;
        this.description = description;
        this.cb = cb;
        this.admin = permissions === CommandPermissionLevel.Admin;
    }

    alias(name: string) {
        CommandRegistry.set(name.toLowerCase(), this);
        return this;
    }

    static register(name: string, description: string, cb: Command["cb"], permissions = CommandPermissionLevel.Normal) {
        if (CommandRegistry.has(name.toLowerCase())) throw new Error("Command already registered");

        const command = new Command(name, description, cb, permissions);
        CommandRegistry.set(name.toLowerCase(), command);
        return command;
    }

    static find(name: string) {
        return CommandRegistry.get(name);
    }

    overwrite(cb: Command["cb"]) {
        this.cb = cb;
        CommandRegistry.set(this.name.toLowerCase(), this);
    };
}

inquirer.registerPrompt("intr-list", interruptedPrompt.from(ListPrompt));
inquirer.registerPrompt("intr-input", interruptedPrompt.from(InputPrompt));
inquirer.registerPrompt("intr-password", interruptedPrompt.from(PasswordPrompt));

export class Menu {
    title;
    type;
    choices: (Choice | inquirer.Separator)[];
    originalLength;
    itrCallback;

    constructor(title: string, type: MenuType, choices?: Choice[], itrCallback?: any) {
        this.title = title;
        this.type = itrCallback ? `intr-${type}` : type;
        this.choices = choices || [];
        this.originalLength = choices?.length || 0;
        this.itrCallback = itrCallback;
    }

    /**
     * 
     * @param { boolean } clear
     * @returns { Promise<number> }
     */
    show(clear?: boolean): Promise<number> {
        if (clear) logo();
        if (!client.terminal) return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Write an option number".magenta);
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

                line.question("", (output) => {
                    if (this.itrCallback && /return|exit|back/.exec(output.trim().toLowerCase())) return this.itrCallback();
                    const option = Number(output.trim());

                    const choice = noSeparators[option - 1] as Choice;

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
                const choice = this.choices[option - 1] as Choice;

                if (choice.cb) choice.cb(option - 1);
                resolve(option - 1);
            } catch (e) {
                if (e !== interruptedPrompt.EVENT_INTERRUPTED) return;

                this.itrCallback();
            }
        });
    }

    addChoice(choice: Choice) {
        this.choices.push(choice);
        return this;
    }

    addSeparator(text?: string) {
        this.choices.push(new inquirer.Separator(text || "───────────────"));
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

export class Choice {
    name: string;
    cb: (option: number) => void;

    constructor(name: string, cb?: Choice["cb"]) {
        this.name = name;
        this.cb = cb || (() => { });
    }
}

export const MainMenu = new Menu("Main Menu", "list", [
    new Choice("Search Plugins", () => {
        pluginsMenu();
    }),
    new Choice("Reload Plugins", async () => {
        const { loadCommands, reloadPlugins } = await import("../Utils");
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

export const GoBack = new Menu("Actions", "list", [new Choice("Go Back")]);

export function enterToContinue(): Promise<string> {
    return new Promise((resolve) => {
        const input = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        console.log("\nPress enter to continue");
        input.question("\n", (response) => {
            input.close();
            resolve(response.trim().toLowerCase());
        });
    });
}

export function logo(extra?: string) {
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

export { Sticker, StickerTypes } from "wa-sticker-formatter";

type MenuType = string;

export enum CommandPermissionLevel {
    Normal,
    Admin
}