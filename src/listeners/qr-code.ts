import terminal from "qrcode-terminal";
import { logo } from "../Utils";
import { client } from "../index";

client.on("qr", (base64: string) => {
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
});