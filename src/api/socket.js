const { default: makeWASocket, useMultiFileAuthState, proto, MiscMessageGenerationOptions, Browsers, downloadMediaMessage } = require("@adiwajshing/baileys");
const qrterminal = require("qrcode-terminal");
const { readFileSync, statSync } = require("fs");
const EventEmitter = require("events");
const P = require("pino");

const logger = P({ level: "silent" });
logger.error = (obj, msg) => {
    this.emit("error", (typeof msg === "string") ? msg : obj);
}

class Client extends EventEmitter {
    /**
     * @type { ReturnType<typeof makeWASocket> }
     */
    socket;
    state;
    saveCreds;
    opts;
    opened;

    constructor(options) {
        super();
        this.opts = options;
    }

    start() {
        return new Promise(async (resolve) => {
            const { state, saveCreds } = await useMultiFileAuthState("auth_info/" + (this.opts?.id || "default"));

            this.state = state;
            this.saveCreds = saveCreds;

            const socket = makeWASocket({
                ...this.opts?.baileysOpts,
                logger,
                auth: state,
                browser: Browsers.appropriate("Desktop"),
                //syncFullHistory: true
            });

            this.socket = socket;
            this.recoverListeners();
            this.setListeners();

            resolve(this);
        });
    }

    /**
     * @param { string } id
     * @param { string | import("@adiwajshing/baileys").AnyMessageContent | Media } content
     * @param { MiscMessageGenerationOptions | undefined } opts
     * @returns { Promise<Message> }
     */
    send(id, content, opts) {
        return new Promise(async (resolve) => {
            if (typeof content === "string") return this.socket.sendMessage(id, { text: content }, opts);
            if (!content.isMedia()) return this.socket.sendMessage(id, { text: content.content }, opts);

            const mimetype = content.mimetype.split("/")[0];
            resolve(new Message(this, await this.socket.sendMessage(id, {
                video: (mimetype === "video") ? content.buffer : undefined,
                video: (mimetype === "image") ? content.buffer : undefined,
                caption: content.text
            }, opts)));
        });
    }

    destroy() {
        this.socket.end();
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
                if (lastDisconnect?.error && this.opts?.shouldReconnect) {
                    this.socket = makeWASocket({
                        auth: this.state,
                        browser: Browsers.appropriate("Desktop"),
                        syncFullHistory: true
                    });
                    this.recoverListeners();
                }
            }

            if (connection === "open") {
                this.opened = true;
                this.emit("open", lastDisconnect);
            }

            if (qr) {
                this.emit("qr", qr);
                if (!this.opts?.autoPrintQr) return;
                qrterminal.generate(qr, { small: true });
            }
        });

        this.emitter.on("messages.upsert", ({ messages }) => {
            messages.forEach((message) => {
                if (message.remoteJid === "status@broadcast") return;

                this.emit("message", new Message(this, message));
            });
        });
    }

    recoverListeners() {
        for (const event in this.eventNames()) {
            for (const listener of this.listeners(event)) {
                this.emitter.on(event, listener);
            }
        }
    }
}

class Message {
    /**
     * @type { Client }
     */
    client;
    /**
     * @type { proto.IWebMessageInfo }
     */
    _data;
    author;
    content;
    /**
     * @type { boolean }
     */
    isReply;
    /**
     * @type { boolean }
     */
    fromMe;
    /**
     * @type { boolean }
     */
    hasMedia
    /**
     * @param { Client } client
     * @param { proto.IWebMessageInfo } data 
     */
    constructor(client, data) {
        const { message, pushName, key: { remoteJid, participant, fromMe }, verifiedBizName } = data;
        this.client = client;
        this.author = (remoteJid?.endsWith("@s.whatsapp.net")) ?
            new User(client, pushName || verifiedBizName || "", remoteJid.split("@")[0], remoteJid) : new GroupUser(client, pushName || "", participant.split("@")[0], participant);
        this.content = message?.conversation || message?.extendedTextMessage?.text || "";
        
        this.fromMe = fromMe;
    }

    /**
     * 
     * @param { string | import("@adiwajshing/baileys").AnyMessageContent | Media} content
     * @param { MiscMessageGenerationOptions } opts 
     * @returns { Promise<Message> }
     */
    reply(content, opts) {
        return this.client.send(this.chat.id, content, { ...opts, quoted: this._data });
    }

    /**
     * @param { string } reaction
     * @returns { Promise<Message> }
     */
    react(reaction) {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this.id, { react: { text: reaction, key: this._data.key } }));
        });
    }

    /**
     * @param { string } reaction
     * @returns { Promise<Message> }
     */
    delete() {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this.id, { delete: this._data.key }));
        });
    }

    /**
     * @returns { Chat }
     */
    getChat() {
        //const id
        //return (remoteJid?.endsWith("@s.whatsapp.net")) ? new Chat(client, ) : new Group(client, data.key);
    }

    /**
     * @returns { Media | undefined }
     */
    downloadMedia() {
        if (!this.hasMedia) return;
        return new Promise(async (resolve) => {
            const buffer = await downloadMediaMessage(this._data, "buffer", {}, {
                logger,
                reuploadRequest: this.client.socket.updateMediaMessage
            })
            resolve(new Media(this.client, this.data, buffer));
        });
    }

    /**
     * @returns { Message | undefined }
     */
    getQuotedMsg() {}
}

class Media {
    /**
     * @type { string }
     */
    mimetype
    /**
     * @type { Buffer }
     */
    buffer
    /**
     * @type { string | undefined }
     */
    text
    /**
     * @type { boolean }
     */
    isImage;
    /**
     * @type { boolean }
     */
    isVideo;
    /**
     * @type { boolean }
     */
    isAudio;
    /**
     * @type { boolean }
     */
    viewOnce;

    /**
     * @param { Buffer } buffer
     * @param { { mimetype: string; size: number; text: string } }
     */
    constructor(buffer, { mimetype, size, text }) {
        this.buffer = buffer;
        this.size = size;
        this.text = text;
        this.mimetype = mimetype;
        this.isImage = Boolean(mimetype.startsWith("image"));
        this.isVideo = Boolean(mimetype.startsWith("video"));
        this.isAudio = Boolean(mimetype.startsWith("audio"));
    }

    /**
     * @param { string } path
     * @param { {
     *  mimetype: "image" | "video" | "gif" | "sticker";
     *  text?: string
     * } } opts
     * @returns { Media }
     */
    static create(path, opts) {
        try {
            const { mimetype, text } = opts;
            const realPath = require.resolve(path);

            const { size } = statSync(realPath);
            return new Media(buffer, {
                mimetype,
                size,
                text
            });
        } catch (e) {
            throw new Error("Can not read file from path " + realPath);
        }
    }
}

class User {
    /**
     * @type { Client }
     */
    client;
    pushname;
    number;
    countryCode;
    id;

    constructor(client, pushname, number, id) {
        this.client = client;
        this.pushname = pushname;
        this.number = number;
        this.id = id;
    }

    sendMessage(content, opts) {
        this.client.send(this.id, content, opts);
    }

    /**
     * 
     * @returns { Promise<import("@adiwajshing/baileys").WABusinessProfile> }
     */
    getProfile() {
        return new Promise(async (resolve) => {
            const profile = await this.client.socket.getBusinessProfile(this.id);
            resolve(profile)
        });
    }
}

class GroupUser extends User {
    /**
     * @type { Client }
     */
    client;
    pushname;
    number;
    countryCode;
    id;
    isAdmin;
    group;

    /**
     * @param { Client } client 
     * @param { import("whatsapp-web.js").GroupChat } group 
     * @param { string } pushname 
     * @param { string } number 
     * @param { string } id 
     */
    constructor(client, group, pushname, number, id) {
        super();
        this.client = client;
        this.group = group;
        this.pushname = pushname;
        this.number = number;
        this.id = id;
    }

    sendDM(content, opts) {
        this.client.send(this.id, content, opts);
    }

    /**
     * 
     * @returns { Promise<import("@adiwajshing/baileys").WABusinessProfile> }
     */
    getProfile() {
        return new Promise(async (resolve) => {
            const profile = await this.client.socket.getBusinessProfile(this.id);
            resolve(profile)
        });
    }
}

class Chat {
    /**
     * @type { Client }
     */
    client;
    id;

    /**
     * @param { Client } client
     * @param { string } id
     */
    constructor(client, id) {
        this.client = client;
        this.id = data.remoteJid;
    }

    /**
     * @param { string | Message | Media } content
     * @returns { Promise<Message> }
     */
    send(content) {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this.id, content));
        });
    }

    isGroup() {
        return true;
    }
}

class Group extends Chat {

    /**
     * @param { Client } client
     * @param { proto.IWebMessageInfo["key"] } data 
     */
    constructor(client, data) {
        super(client, data)
    }

    /**
     * 
     * @returns { Promise<import("@adiwajshing/baileys").GroupMetadata> }
     */
    getInfo() {
        return new Promise(async (resolve) => {
            const meta = await this.client.socket.groupMetadata(this.id);
            resolve(meta);
        });
    }

    isAdmin(user) {
        return true;
    }
}

exports = {
    Client,
    Message,
    Media,
    User,
    GroupUser,
    Chat,
    Group
}