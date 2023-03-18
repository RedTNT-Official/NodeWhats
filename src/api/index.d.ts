import { Client, Message, User } from "./socket";
export { Sticker, StickerTypes } from "wa-sticker-formatter";

export const prefix = ".";
export const CommandRegistry: Map<string, Command>;

export const client: Client;
export const MainMenu: Menu;
export const GoBack: Menu;

export function enterToContinue(): Promise<string>;
export function logo(extra?: string): void;

export class Command {
    name: string;
    description: string;
    admin: boolean;
    cb: (user: User, message: Message, args: string[]) => void;

    constructor(name: string, description: string, cb: Command["cb"], permissions: CommandPermissionLevel);

    alias(name: string): Command;

    overwrite(cb: Command["cb"]): Command;

    static register(name: string, description: string, cb: Command["cb"], permissions?: CommandPermissionLevel): Command;

    static find(name: string): Command;
}

export class Menu {
    title: string;
    type: MenuType;
    choices: Choice[];

    constructor(title: string, type: MenuType, choices?: Choice[], itrCallback?: () => void);

    show(): Promise<number>;

    addChoice(choice: Choice): this;

    addSeparator(text?: string): this;

    resetChoices(): void;
}

type MenuType = string;

export class Choice {
    name: string;
    cb: () => void;

    constructor(name: string, cb?: Choice["cb"]);
}

export enum CommandPermissionLevel {
    Normal,
    Admin
}