import { AnyMessageContent, GroupMetadata, MiscMessageGenerationOptions, SocketConfig, WABusinessProfile } from "@adiwajshing/baileys/lib/Types";
import EventEmitter from "events";

export class Client extends EventEmitter {
    readonly opened: boolean;
    opts?: ClientOptions;
    terminal: boolean;

    constructor(options?: ClientOptions);

    start(): Promise<this>
    destroy(): void;

    send(id: string, content: string | Message | Media, opts?: MiscMessageGenerationOptions): void;
    getProfilePicUrl(id: string): Promise<string | undefined>;

    on<T extends keyof ClientEvents>(event: T, listener: (args: ClientEvents[T]) => void): this;
}

export class User {
    readonly pushname?: string;
    readonly number: string;
    readonly countryCode: string;
    readonly id: string;

    protected constructor();

    sendMessage(content: Message | Media, opts: MiscMessageGenerationOptions): Promise<void>;
    getProfilePicUrl(): Promise<string | undefined>;

    getProfile(): Promise<WABusinessProfile>;
}

export class GroupUser extends User {
    readonly countryCode: string;
    readonly pushname?: string;
    readonly isAdmin: boolean;
    readonly number: string;
    readonly id: string;

    sendDM(content: Message | Media, opts: MiscMessageGenerationOptions): Promise<void>;

    getProfile(): Promise<WABusinessProfile>;
    getGroup(): Promise<Group>;
}

export class Message {
    readonly author: User;
    readonly fromMe: boolean;
    readonly content: string;
    readonly isReply: boolean;
    readonly hasMedia: boolean;

    private constructor();

    reply(content: string | AnyMessageContent | Media, opts?: MiscMessageGenerationOptions): Promise<Message>;

    react(reaction: string): Promise<Message>;

    getChat(): Promise<Chat>;

    downloadMedia(): Promise<Media> | undefined;

    getQuotedMsg(): Promise<Message> | undefined;
}

export class Media {
    mimetype: string
    text?: string;
    size: number;
    buffer: Buffer;
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    isDocument: boolean;
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