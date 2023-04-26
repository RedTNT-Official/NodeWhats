import makeWASocket, { useMultiFileAuthState, proto, MiscMessageGenerationOptions, Browsers, downloadMediaMessage, DisconnectReason, BaileysEventMap, AnyMessageContent, WABusinessProfile, GroupMetadata, makeInMemoryStore, makeCacheableSignalKeyStore } from "@adiwajshing/baileys";
import { SocketConfig } from "@adiwajshing/baileys";
import { readFileSync, statSync } from "fs";
import EventEmitter from "events";
import { Boom } from "@hapi/boom";
import P from "pino";

export class Client extends EventEmitter {
    socket: ReturnType<typeof makeWASocket>;
    private store: ReturnType<typeof makeInMemoryStore>;
    private saveCreds: () => Promise<void>;
    opened: boolean;
    terminal: boolean = true;
    opts?: ClientOptions;

    constructor(options?: ClientOptions) {
        super();
        this.opts = options;
    }

    start() {
        return new Promise(async (resolve) => {
            const { state, saveCreds } = await useMultiFileAuthState("auth_info/" + (this.opts?.id || "default"));
            const logger = P({ level: "silent" });

            this.saveCreds = saveCreds;
            this.store = makeInMemoryStore({ logger });

            const socket = makeWASocket({
                ...this.opts?.baileysOpts,
                logger,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                browser: Browsers.appropriate("Desktop"),
                generateHighQualityLinkPreview: true,
                getMessage: async ({ remoteJid, id }) => {
                    if (!this.store) return proto.Message.fromObject({});

                    const msg = await this.store.loadMessage(remoteJid!, id!);
                    return msg?.message!;
                }
            });

            this.socket = socket;
            this.store.bind(this.emitter);
            this.recoverListeners();
            this.setListeners();

            resolve(this);
        });
    }

    send(id: string, content: string | Media | AnyMessageContent, opts?: MiscMessageGenerationOptions): Promise<Message> {
        return new Promise(async (resolve) => {
            let msg: proto.WebMessageInfo;
            if (typeof content === "string") msg = (await this.socket.sendMessage(id, { text: content }, opts))!;
            else if (content instanceof Media) msg = (await this.socket.sendMessage(id, {
                text: content.text,
                video: (content.isVideo) ? content.buffer : undefined,
                image: (content.isImage) ? content.buffer : undefined,
                // @ts-ignore
                audio: (content.isAudio) ? content.buffer : undefined
            }, opts))!;

            else msg = (await this.socket.sendMessage(id, content, {
                ...opts
            }))!;

            resolve(new Message(this, msg));
        });
    }

    getProfilePicUrl(id: string): Promise<string | undefined> {
        return new Promise(async (resolve) => {
            try {
                const url = await this.socket.profilePictureUrl(id, "image");
                resolve(url);
            } catch (e) {
                resolve(undefined);
            }
        });
    }

    destroy() {
        this.socket.end(undefined);
    }

    get emitter() {
        return this.socket.ev;
    }

    setListeners() {
        this.emitter.on("creds.update", this.saveCreds);

        this.emitter.on("connection.update", ({ connection, lastDisconnect, qr }) => {
            if (connection === "close") {
                this.opened = false;
                this.emit("close", lastDisconnect);

                const error = (lastDisconnect?.error as Boom);
                if (error?.output.statusCode !== DisconnectReason.loggedOut && this.opts?.shouldReconnect) this.start();
            }

            if (connection === "open") {
                this.opened = true;
                this.emit("open", lastDisconnect);
            }

            if (qr) this.emit("qr", qr);
        });

        this.emitter.on("messages.upsert", ({ messages }) => {
            messages.forEach((message) => {
                if (message.key.remoteJid === "status@broadcast" || !message.message) return;

                this.emit("message", new Message(this, message));
            });
        });
    }

    recoverListeners<T extends keyof BaileysEventMap>() {
        for (const event in this.eventNames()) {
            for (const listener of this.listeners(event)) {
                this.emitter.on(event as T, listener as (arg: BaileysEventMap[T]) => void);
            }
        }
    }
}

export declare interface Client {
    on<T extends keyof ClientEvents>(event: T, cb: (args: ClientEvents[T]) => void): this;
    emit<T extends keyof ClientEvents>(event: T, args: ClientEvents[T]): boolean;
}

export class Message {
    protected _data: proto.IWebMessageInfo;
    id: string;
    client: Client;
    author: User;
    content: string;
    isReply: boolean;
    fromMe: boolean;
    hasMedia: boolean;

    constructor(client: Client, data: proto.IWebMessageInfo) {
        const { message, pushName, key: { remoteJid, participant, fromMe, id }, verifiedBizName } = data;

        this.client = client;
        this._data = data;
        this.id = id!;
        this.author = (remoteJid?.endsWith("@s.whatsapp.net")) ?
            new User(client, pushName || verifiedBizName || "", remoteJid.split("@")[0], remoteJid) : new GroupUser(client, remoteJid!, pushName || verifiedBizName || "", participant?.split("@")[0]!, participant!);
        this.fromMe = fromMe!;
        // @ts-ignore
        this.isReply = !!(message![Object.keys(message!)[0] as keyof proto.IMessage]?.contextInfo as proto.ContextInfo)?.quotedMessage;
        const type = Object.keys(data.message!)[0];
        // @ts-ignore
        this.content = message?.conversation || message?.extendedTextMessage?.text || message![type]?.caption || "";
        this.hasMedia = ["imageMessage", "videoMessage", "stickerMessage", "audioMessage", "documentMessage", "documentWithCaptionMessage", "viewOnceMessage"].includes(type);
        if (message?.documentWithCaptionMessage) this.content = message.documentWithCaptionMessage.message?.documentMessage?.caption!;
    }


    reply(content: string | Media | AnyMessageContent, opts?: MiscMessageGenerationOptions): Promise<Message> {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid!, content, { ...opts, quoted: this._data }));
        });
    }

    react(reaction: string): Promise<Message> {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid!, {
                react: { text: reaction, key: this._data.key }
            }));
        });
    }

    delete(): Promise<Message> {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid!, { delete: this._data.key }));
        });
    }

    getChat(): Promise<Chat> {
        return new Promise(async (resolve) => {
            const id = this._data.key.remoteJid;
            resolve((id?.endsWith("@s.whatsapp.net")) ? new Chat(this.client, id) : new Group(this.client, await this.client.socket.groupMetadata(id!), id!));
        });
    }

    downloadMedia(): Promise<Media> | undefined {
        if (!this.hasMedia) return;
        return new Promise(async (resolve) => {
            const logger = P({ level: "fatal" });

            const buffer = await downloadMediaMessage(this._data, "buffer", {}, {
                logger,
                reuploadRequest: this.client.socket.updateMediaMessage
            }) as Buffer;

            const msg = this._data.message?.viewOnceMessage?.message || this._data.message!;
            let type = Object.keys(msg)[0];

            // @ts-ignore
            const data = msg.documentWithCaptionMessage?.message?.documentMessage || msg[type];
            resolve(new Media(buffer, { mimetype: data.mimetype, size: data.fileLength, text: data.caption }));
        });
    }

    getQuotedMsg(): Message | undefined {
        if (!this.isReply) return;

        // @ts-ignore
        let ctx: proto.IContextInfo = this._data.message[Object.keys(this._data.message)[0]]?.contextInfo;

        if (!ctx) return;

        return new Message(this.client, {
            key: {
                fromMe: (ctx.participant || ctx.remoteJid) == this.author.id,
                participant: ctx.participant,
                remoteJid: ctx.remoteJid || this._data.key.remoteJid,
                id: ctx.stanzaId
            },
            message: ctx.quotedMessage
        })
    }

    getMentions(): Promise<User[]> {
        return new Promise(async (resolve) => {
            const mentionedJid = this._data.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            const mentioned: User[] = [];

            if (mentionedJid) for (const jid of mentionedJid) {
                if (this._data.key.remoteJid?.endsWith("@s.whatsapp.net"))
                    mentioned.push(new User(this.client, undefined, jid.split("@")[0], jid));
    
                mentioned.push(new GroupUser(this.client, this._data.key.remoteJid!, undefined, jid?.split("@")[0]!, jid!));
            }

            resolve(mentioned);
        });
    }
}

export class Media {
    mimetype: string
    buffer: Buffer
    size: number;
    text?: string
    isImage: boolean;
    isVideo: boolean;
    isAudio: boolean;
    isDocument: boolean;
    viewOnce: boolean;

    constructor(buffer: Buffer, opts: { mimetype: string; size: number; text?: string; viewOnce?: boolean }) {
        const { mimetype, size, text, viewOnce } = opts;
        this.buffer = buffer;
        this.size = size;
        this.text = text;
        this.mimetype = mimetype;
        this.viewOnce = !!viewOnce;
        this.isImage = Boolean(mimetype.startsWith("image"));
        this.isVideo = Boolean(mimetype.startsWith("video"));
        this.isAudio = Boolean(mimetype.startsWith("audio"));
        this.isDocument = Boolean(mimetype.startsWith("document"));
    }

    static create(path: string, opts: {
        mimetype: "image" | "video" | "gif" | "sticker";
        text?: string;
        viewOnce?: boolean;
    }): Media {
        const realPath = require.resolve(path);

        try {
            const { mimetype, text, viewOnce } = opts;
            const { size } = statSync(realPath);
            const buffer = readFileSync(realPath);

            return new Media(buffer, {
                mimetype,
                size,
                text,
                viewOnce
            });
        } catch (e) {
            throw new Error("Can not read file from path " + realPath);
        }
    }
}

export class User {
    client: Client;
    pushname?: string;
    number: string;
    countryCode: string;
    id: string;

    constructor(client: Client, pushname: string = "", number: string, id: string) {
        this.client = client;
        this.pushname = pushname;
        this.number = number;
        this.id = id;
    }

    sendMessage(content: string | Media | AnyMessageContent, opts?: MiscMessageGenerationOptions) {
        this.client.send(this.id, content, opts);
    }

    getProfile(): Promise<WABusinessProfile> {
        return new Promise(async (resolve) => {
            const profile = await this.client.socket.getBusinessProfile(this.id);
            resolve(profile as WABusinessProfile);
        });
    }

    /**
     * @returns { Promise<string | undefined> }
     */
    getProfilePicUrl(): Promise<string | undefined> {
        return new Promise(async (resolve) => {
            const url = await this.client.getProfilePicUrl(this.id);
            resolve(url);
        });
    }
}

export class GroupUser extends User {
    /**
     * @type { Client }
     */
    client: Client;
    pushname?: string;
    number;
    countryCode: string;
    id;
    isAdmin: boolean;
    groupId: string;

    constructor(client: Client, groupId: string, pushname: string = "", number: string, id: string) {
        super(client, pushname, number, id);
        this.groupId = groupId;
        this.client = client;
        this.pushname = pushname;
        this.number = number;
        this.id = id;
    }

    sendDM(content: string | Media | AnyMessageContent, opts: MiscMessageGenerationOptions) {
        this.client.send(this.id, content, opts);
    }

    getProfile(): Promise<WABusinessProfile> {
        return new Promise(async (resolve) => {
            const profile = await this.client.socket.getBusinessProfile(this.id);
            resolve(profile as WABusinessProfile)
        });
    }

    /**
     * 
     * @returns { Promise<Group> }
     */
    getGroup(): Promise<Group> {
        return new Promise(async (resolve) => {
            const group = new Group(this.client, await this.client.socket.groupMetadata(this.groupId), this.groupId);
            resolve(group);
        });
    }
}

export class Chat {
    /**
     * @type { Client }
     */
    client: Client;
    id;

    /**
     * @param { Client } client
     * @param { string } id
     */
    constructor(client: Client, id: string) {
        this.client = client;
        this.id = id;
    }

    send(content: string | Media | AnyMessageContent): Promise<Message> {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this.id, content));
        });
    }

    isGroup(): this is Group {
        return this.id.endsWith("@g.us");
    }
}

export class Group extends Chat {
    protected _data: GroupMetadata;
    name;
    description;

    constructor(client: Client, data: GroupMetadata, id: string) {
        super(client, id);
        this._data = data;
        this.name = data.subject;
        this.description = data.desc;
    }

    isAdmin(user: User) {
        return this._data.participants.some((p) => {
            return p.id === user.id && (p.isAdmin || p.isSuperAdmin);
        });
    }
}

export interface ClientOptions {
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