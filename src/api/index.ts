import { Client, Contact, LocalAuth, Message } from "whatsapp-web.js";
import { CommandRegistry, loadCommands, reloadPlugins } from "../Utils";
// @ts-ignore
import * as interruptedPrompt from "inquirer-interrupted-prompt";
import { createInterface } from "readline";
import { pluginsMenu } from "../pluginManager/pluginsInstaller";
import PasswordPrompt from "inquirer/lib/prompts/password";
import * as inquirer from "inquirer";
import InputPrompt from "inquirer/lib/prompts/input";
import ListPrompt from "inquirer/lib/prompts/list";
import "colors";

export const prefix = ".";

export const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        headless: true
    }
});

export class Command {
    name: string;
    description: string;
    admin: boolean;
    cb: (contact: Contact, msg: Message, args: string[]) => void;

    private constructor(name: string, description: string, cb: Command["cb"], permissions: CommandPermissionLevel) {
        this.name = name;
        this.description = description;
        this.cb = cb;
        this.admin = permissions === CommandPermissionLevel.Admin;
    }

    alias(name: string): this {
        CommandRegistry.set(name.toLowerCase(), this);
        return this;
    }

    static register(name: string, description: string, cb: Command["cb"], permissions: CommandPermissionLevel = CommandPermissionLevel.Normal): Command {
        if (CommandRegistry.has(name.toLowerCase())) throw new Error("Command already registered");

        const command = new Command(name, description, cb, permissions);
        CommandRegistry.set(name.toLowerCase(), command);
        return command;
    }

    static find(name: string): Command | undefined {
        return CommandRegistry.get(name);
    }

    overwrite(cb: Command["cb"]) {
        this.cb = cb;
        CommandRegistry.set(this.name.toLowerCase(), this);
    };
}

export enum CommandPermissionLevel {
    Normal,
    Admin
}

// @ts-ignore
inquirer.registerPrompt("intr-list", interruptedPrompt.from(ListPrompt));
// @ts-ignore
inquirer.registerPrompt("intr-input", interruptedPrompt.from(InputPrompt));
// @ts-ignore
inquirer.registerPrompt("intr-password", interruptedPrompt.from(PasswordPrompt));

export class Menu {
    title: string;
    type: string;
    choices: Choice[];
    originalLength: number;
    itrCallback?: () => void;

    constructor(title: string, type: MenuType, choices: Choice[], itrCallback?: () => void) {
        this.title = title;
        this.type = itrCallback ? `intr-${type}` : type;
        this.choices = choices || [];
        this.originalLength = choices?.length || 0;
        this.itrCallback = itrCallback;
    }
    
    show(): Promise<number> {
        return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Select an option".magenta);
                console.log("=".repeat(25).green);

                const { option } = await inquirer.prompt([
                    this.parse()
                ]);
                this.choices[option - 1].cb(option - 1);
                resolve(option - 1);
            } catch (e) {
                if (e !== interruptedPrompt.EVENT_INTERRUPTED) return;

                this.itrCallback!();
            }
        });
    }

    addChoice(choice: Choice): this {
        this.choices.push(choice);
        return this;
    }

    resetChoices() {
        this.choices = this.choices.slice(0, this.originalLength);
    }

    parse() {
        return {
            type: this.type,
            name: "option",
            message: this.title + "\n",
            choices: this.choices.map(({ name }, index) => {
                return {
                    name,
                    value: index + 1
                }
            })
        }
    }
}

export class Choice {
    name: string;
    cb: (index: number) => void;

    constructor(name: string, cb?: () => void) {
        this.name = name;
        this.cb = cb || (() => { });
    }
}

type MenuType = "input" | "number" | "password" | "list" | "rawlist" | "expand" | "checkbox" | "confirm" | "editor";

export const MainMenu = new Menu("Main Menu", "list", [
    new Choice("Search Plugins", () => {
        pluginsMenu();
    }),
    new Choice("Reload Plugins", async () => {
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
        await client.destroy();
        process.exit();
    })
]);

export const GoBack = new Menu("Actions", "list", [new Choice("Go Back")]);

export function enterToContinue(): Promise<void> {
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

export function logo(extra?: string) {
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