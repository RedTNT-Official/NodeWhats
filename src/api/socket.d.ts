import { AnyMessageContent, GroupMetadata, MiscMessageGenerationOptions, SocketConfig, WABusinessProfile } from "@adiwajshing/baileys/lib/Types";
import EventEmitter from "events";
import { GroupChat } from "whatsapp-web.js";

export class Client extends EventEmitter {
    readonly opened: boolean;
    opts?: ClientOptions;

    constructor(options?: ClientOptions);

    start(): Promise<this>
    destroy(): void;
    send(id: string, content: string | Message | Media, opts?: MiscMessageGenerationOptions): void;

    on<T extends keyof ClientEvents>(event: T, listener: (args: ClientEvents[T]) => void): this;
}

export class User {
    readonly pushname?: string;
    readonly number: string;
    readonly countryCode: string;
    readonly id: string;

    protected constructor();

    sendMessage(content: Message | Media, opts: MiscMessageGenerationOptions): Promise<void>;

    getProfile(): Promise<WABusinessProfile>;
}

export class GroupUser extends User {
    readonly pushname?: string;
    readonly number: string;
    readonly countryCode: string;
    readonly id: string;
    readonly isAdmin: boolean;
    readonly group: GroupChat;

    sendDM(content: Message | Media, opts: MiscMessageGenerationOptions): Promise<void>;

    getProfile(): Promise<WABusinessProfile>;
}

export class Message {
    readonly author: User;
    readonly content: string;
    readonly isReply: boolean;
    readonly fromMe: boolean;
    readonly hasMedia: boolean;

    private constructor();

    reply(content: string | AnyMessageContent | Media, opts?: MiscMessageGenerationOptions): Promise<Message>;

    react(reaction: string): Promise<Message>;

    getChat(): Promise<Chat>;

    downloadMedia(): Promise<Media | undefined>;

    getQuotedMsg(): Promise<Message | undefined>;
}

export class Media {
    mimetype: string
    text?: string;
    size: number;
    buffer: Buffer;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    viewOnce: boolean;

    private constructor();

    create(path: string, opts: { mimetype: "image" | "video" | "gif" | "sticker"; text?: string }): Media;
}

export class Chat {
    readonly id: string;

    protected constructor();

    send(content: string | AnyMessageContent | Media): Promise<Message>;

    isGroup(): this is Group;
}

export class Group extends Chat {

    isAdmin(user: User): boolean;

    getInfo(): Promise<GroupMetadata>;
}

interface ClientOptions {
    id?: string;
    autoPrintQr?: boolean;
    shouldReconnect?: boolean;
    baileysOpts?: Partial<SocketConfig>;
}

type ClientEvents = {
    error: string;
    message: Message;
    qr: string;
    open: {
        error: Error | undefined;
        date: Date;
    } | undefined
    close: {
        error: Error | undefined;
        date: Date;
    } | undefined
}