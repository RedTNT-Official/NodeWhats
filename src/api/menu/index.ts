// @ts-ignore
import interruptedPrompt from "inquirer-interrupted-prompt";
import { createInterface } from "readline";
import PasswordPrompt from "inquirer/lib/prompts/password";
import InputPrompt from "inquirer/lib/prompts/input";
import ListPrompt from "inquirer/lib/prompts/list";
import inquirer from "inquirer";
import { client } from "..";

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

    show(clear?: boolean): Promise<number> {
        if (clear) logo();
        if (!client.terminal) return new Promise(async (resolve) => {
            try {
                console.log("=".repeat(25).green);
                console.log("Write an option number".magenta);
                console.log("=".repeat(25).green);

                console.log(`${"?".green} ${this.title}`);

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
            pageSize: this.choices.length,
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

type MenuType = string;

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
        " _   _           _       ".red + "_    _ _           _       ".green,
        "| \\ | |         | |     ".red + "| |  | | |         | |      ".green,
        "|  \\| | ___   __| | ___ ".red + "| |  | | |__   __ _| |_ ___ ".green,
        "| . ` |/ _ \\ / _` |/ _ \\".red + "| |/\\| | '_ \\ / _` | __/ __|".green,
        "| |\\  | (_) | (_| |  __/".red + "\\  /\\  / | | | (_| | |_\\__ \\".green,
        "\\_| \\_/\\___/ \\__,_|\\___|".red + " \\/  \\/|_| |_|\\__,_|\\__|___/".green,
        " "
    ].join("\n"));

    if (extra) console.log(extra);
}

export { MainMenu } from "./main";