import { client } from "bot";
import { logo } from "bot/menu";
import terminal from "qrcode-terminal";
import Spinner from "../loading";

client.on("qr", (base64: string) => {
    Spinner.stop();
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
});