const { default: makeWASocket, useMultiFileAuthState, proto, MiscMessageGenerationOptions, Browsers, downloadMediaMessage, DisconnectReason } = require("@adiwajshing/baileys");
const qrterminal = require("qrcode-terminal");
const EventEmitter = require("events");
const { statSync } = require("fs");
const P = require("pino");
const { Boom } = require("@hapi/boom");

const tempStore = {};

class Client extends EventEmitter {
    /**
     * @type { ReturnType<typeof makeWASocket> }
     */
    socket;
    state;
    saveCreds;
    opts;
    opened;
    /**
     * @type { boolean }
     */
    terminal = true;

    constructor(options) {
        super();
        this.opts = options;
    }

    start() {
        return new Promise(async (resolve) => {
            const { state, saveCreds } = await useMultiFileAuthState("auth_info/" + (this.opts?.id || "default"));

            this.state = state;
            this.saveCreds = saveCreds;

            const logger = P({ level: "fatal" });
            logger.error = (obj, msg) => {
                this.emit("error", (typeof msg === "string") ? msg : obj);
            }

            const socket = makeWASocket({
                ...this.opts?.baileysOpts,
                logger,
                auth: state,
                browser: Browsers.appropriate("Desktop"),
                getMessage: async (key) => {
                    const { id } = key;
                    console.log('Resending', id);
                    return tempStore[id]?.message;
                }
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
            let msg;
            if (typeof content === "string") msg = await this.socket.sendMessage(id, { text: content }, opts);
            else if (content instanceof Media) msg = await this.socket.sendMessage(id, {
                text: content.text,
                video: (content.isVideo) ? content.buffer : undefined,
                image: (content.isImage) ? content.buffer : undefined,
                audio: (content.isAudio) ? content.buffer : undefined
            }, opts);

            else msg = await this.socket.sendMessage(id, content, {
                ...opts
            });

            tempStore[msg.key.id] = msg;
            resolve(new Message(this, msg));
        });
    }

    /**
     * @param { string } id 
     * @returns { Promise<string | undefined> }
     */
    getProfilePicUrl(id) {
        return new Promise(async (resolve) => {
            const url = await this.socket.profilePictureUrl(id, "image");
            resolve(url);
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
                /**
                 * @type { Boom }
                 */
                const error = lastDisconnect.error;
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
                if (message.remoteJid === "status@broadcast" || !message.message) return;

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
exports.Client = Client;

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
        this._data = data;
        this.author = (remoteJid?.endsWith("@s.whatsapp.net")) ?
            new User(client, pushName || verifiedBizName || "", remoteJid.split("@")[0], remoteJid) : new GroupUser(client, remoteJid, pushName || "", participant.split("@")[0], participant);
        this.fromMe = fromMe;
        this.isReply = !!message[Object.keys(message)[0]]?.contextInfo;
        const type = Object.keys(data.message)[0];
        this.content = message?.conversation || message?.extendedTextMessage?.text || message[type].caption || "";
        this.hasMedia = ["imageMessage", "videoMessage", "stickerMessage", "audioMessage", "documentMessage", "documentWithCaptionMessage"].includes(type);
        if (message.documentWithCaptionMessage) this.content = message.documentWithCaptionMessage.message.documentMessage.caption;
    }

    /**
     * 
     * @param { string | import("@adiwajshing/baileys").AnyMessageContent | Media } content
     * @param { MiscMessageGenerationOptions } opts 
     * @returns { Promise<Message> }
     */
    reply(content, opts) {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid, content, { ...opts, quoted: this._data }));
        });
    }

    /**
     * @param { string } reaction
     * @returns { Promise<Message> }
     */
    react(reaction) {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid, { react: { text: reaction, key: this._data.key } }));
        });
    }

    /**
     * @param { string } reaction
     * @returns { Promise<Message> }
     */
    delete() {
        return new Promise(async (resolve) => {
            resolve(await this.client.send(this._data.key.remoteJid, { delete: this._data.key }));
        });
    }

    /**
     * @returns { Promise<Chat | Group> }
     */
    getChat() {
        return new Promise((resolve) => {
            const id = this._data.key.remoteJid;
            resolve((id?.endsWith("@s.whatsapp.net")) ? new Chat(this.client, id) : new Group(this.client, this.client.socket.groupMetadata(id), id));
        });
    }

    /**
     * @returns { Promise<Media> | undefined }
     */
    downloadMedia() {
        if (!this.hasMedia) return;
        return new Promise(async (resolve) => {
            const logger = P({ level: "fatal" });
            logger.error = (obj, msg) => {
                this.emit("error", (typeof msg === "string") ? msg : obj);
            }

            const buffer = await downloadMediaMessage(this._data, "buffer", {}, {
                logger,
                reuploadRequest: this.client.socket.updateMediaMessage
            })

            const type = Object.keys(this._data.message)[0];
            let data = this._data.message[type];
            if (this._data.message.documentWithCaptionMessage) data = this._data.message.documentWithCaptionMessage.message.documentMessage;
            resolve(new Media(buffer, { mimetype: data.mimetype, size: data.fileLength, text: data.caption }));
        });
    }

    /**
     * @returns { Message | undefined }
     */
    getQuotedMsg() {
        if (!this.isReply) return;

        /**
         * @type { proto.IContextInfo }
         */
        let ctx = this._data.message[Object.keys(this._data.message)[0]]?.contextInfo;

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
exports.Message = Message;

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
    isDocument;
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
        this.isDocument = Boolean(mimetype.startsWith("document"));
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
exports.Media = Media;

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

    /**
     * @returns { Promise<string | undefined> }
     */
    getProfilePicUrl() {
        return new Promise(async (resolve) => {
            const url = await this.client.getProfilePicUrl(this.id);
            resolve(url);
        });
    }
}
exports.User = User;

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
     * @param { string } groupId
     * @param { string } pushname
     * @param { string } number
     * @param { string } id
     */
    constructor(client, groupId, pushname, number, id) {
        super(client, pushname, number, id);
        this.group = groupId;
        this.client = client;
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

    /**
     * 
     * @returns { Promise<Group> }
     */
    getGroup() {
        return new Promise(async (resolve) => {
            const group = new Group(this.client, await this.client.socket.groupMetadata(this.group));
            resolve(group);
        });
    }
}
exports.GroupUser = GroupUser;

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
        this.id = id;
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
exports.Chat = Chat;

class Group extends Chat {
    name;
    description;

    /**
     * @param { Client } client
     * @param { import("@adiwajshing/baileys").GroupMetadata } data 
     */
    constructor(client, data, id) {
        super(client, id);
        this.name = data.subject;
        this.description = data.desc;
    }

    /**
     * @param { Client } client
     * @param { string } id
     * @returns { Promise<Group> }
     */
    create(client, id) {
        return new Promise(async (resolve) => {
            resolve(new Group(client, await client.socket.groupMetadata(id)));
        });
    }

    isAdmin(user) {
        return true;
    }
}
exports.Group = Group