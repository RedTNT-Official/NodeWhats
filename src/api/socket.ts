import makeWASocket, { useMultiFileAuthState, proto, MiscMessageGenerationOptions, Browsers, downloadMediaMessage, DisconnectReason, BaileysEventMap, AnyMessageContent, WABusinessProfile, GroupMetadata } from "@adiwajshing/baileys";
import { AuthenticationState, SocketConfig } from "@adiwajshing/baileys";
import { readFileSync, statSync } from "fs";
import EventEmitter from "events";
import { Boom } from "@hapi/boom";
import P from "pino";

const tempStore: Record<string, proto.WebMessageInfo> = {};

export class Client extends EventEmitter {
    socket: ReturnType<typeof makeWASocket>;
    private state: AuthenticationState;
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

            this.state = state;
            this.saveCreds = saveCreds;

            const logger = P({ level: "fatal" });
            //logger.error = (obj: any, msg: any) => {
            //    this.emit("error", (typeof msg === "string") ? msg : obj);
            //}

            const socket = makeWASocket({
                ...this.opts?.baileysOpts,
                logger,
                auth: state,
                browser: Browsers.appropriate("Desktop"),
                getMessage: async (key) => {
                    const { id } = key;
                    console.log('Resending', id);
                    return tempStore[id!]?.message!;
                }
                //syncFullHistory: true
            });

            this.socket = socket;
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

            tempStore[msg.key.id!] = msg!;
            resolve(new Message(this, msg));
        });
    }

    getProfilePicUrl(id: string): Promise<string | undefined> {
        return new Promise(async (resolve) => {
            const url = await this.socket.profilePictureUrl(id, "image");
            resolve(url);
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
        this.isReply = !!message![Object.keys(message!)[0] as keyof proto.IMessage]?.contextInfo;
        const type = Object.keys(data.message!)[0];
        // @ts-ignore
        this.content = message?.conversation || message?.extendedTextMessage?.text || message![type]?.caption || "";
        this.hasMedia = ["imageMessage", "videoMessage", "stickerMessage", "audioMessage", "documentMessage", "documentWithCaptionMessage"].includes(type);
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

    /**
     * @returns { Promise<Chat | Group> }
     */
    getChat(): Promise<Chat | Group> {
        return new Promise(async (resolve) => {
            const id = this._data.key.remoteJid;
            resolve((id?.endsWith("@s.whatsapp.net")) ? new Chat(this.client, id) : new Group(this.client, await this.client.socket.groupMetadata(id!), id!));
        });
    }

    /**
     * @returns { Promise<Media> | undefined }
     */
    downloadMedia(): Promise<Media> | undefined {
        if (!this.hasMedia) return;
        return new Promise(async (resolve) => {
            const logger = P({ level: "fatal" });

            const buffer = await downloadMediaMessage(this._data, "buffer", {}, {
                logger,
                reuploadRequest: this.client.socket.updateMediaMessage
            }) as Buffer;

            const type = Object.keys(this._data.message!)[0];
            // @ts-ignore
            let data = this._data.message[type];
            if (this._data.message?.documentWithCaptionMessage) data = this._data.message.documentWithCaptionMessage.message?.documentMessage;
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
    pushname: string;
    number: string;
    countryCode: string;
    id: string;

    constructor(client: Client, pushname: string, number: string, id: string) {
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
    pushname: string;
    number;
    countryCode: string;
    id;
    isAdmin: boolean;
    groupId: string;

    /**
     * @param { Client } client
     * @param { string } groupId
     * @param { string } pushname
     * @param { string } number
     * @param { string } id
     */
    constructor(client: Client, groupId: string, pushname: string, number: string, id: string) {
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
        return false;
    }
}

export class Group extends Chat {
    name;
    description;

    constructor(client: Client, data: GroupMetadata, id: string) {
        super(client, id);
        this.name = data.subject;
        this.description = data.desc;
    }

    isAdmin(user: User) {
        return true;
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