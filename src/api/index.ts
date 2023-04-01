import { Client, Message, User } from "./socket";
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

export { Sticker, StickerTypes } from "wa-sticker-formatter";

export enum CommandPermissionLevel {
    Normal,
    Admin
}