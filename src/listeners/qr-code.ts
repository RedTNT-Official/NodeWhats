import { createWriteStream } from "fs";
import { client, logo } from "bot";
import terminal from "qrcode-terminal";
import Spinner from "../loading";
import qrimage from "qr-image";

client.on("qr", (base64: string) => {
    Spinner.stop();
    logo("Scan this QR code".yellow);
    terminal.generate(base64, { small: true });
    qrimage.image(base64, { margin: 3 }).pipe(createWriteStream("./qr.png"));
});