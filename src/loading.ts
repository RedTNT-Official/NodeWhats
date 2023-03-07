import ansi from "ansi";
import readline from "readline";

const cursor = ansi(process.stdout);

class LoadingSpinner {
    index = 0;
    sequence = ['|', '/', '-', '\\'];
    settings: LoadingSpinnerSettings;
    spinnerTimer: NodeJS.Timeout;

    start(interval: number, options?: LoadingSpinnerSettings) {
        interval = interval || 100;

        this.settings = {
            clearChar: options?.clearChar || true,
            clearLine: options?.clearLine || true,
            doNotBlock: options?.doNotBlock || true,
            hideCursor: options?.hideCursor || true
        };

        if (this.settings.hideCursor) {
            cursor.hide();
        }

        this.index = 0;
        process.stdout.write(this.sequence[this.index]);
        this.spinnerTimer = setInterval(() => {
            process.stdout.write(this.sequence[this.index].replace(/./g, '\b'));
            this.index = (this.index < this.sequence.length - 1) ? this.index + 1 : 0;
            process.stdout.write(this.sequence[this.index]);
        }, interval);

        if (this.settings.doNotBlock) {
            this.spinnerTimer.unref();
        }
    }

    stop() {
        clearInterval(this.spinnerTimer);

        if (this.settings.clearChar) {
            readline.moveCursor(process.stdout, -1, 0);
            readline.clearLine(process.stdout, 1);
        }

        if (this.settings.clearLine) {
            readline.clearLine(process.stdout, 0);
        }

        if (this.settings.hideCursor) {
            cursor.show();
        }
    }

    setSequence(customSequence: string[]) {
        if (customSequence.constructor === Array) {
            this.sequence = customSequence;
        }
    }
}

interface LoadingSpinnerSettings {
    clearChar?: boolean;
    clearLine?: boolean;
    doNotBlock?: boolean;
    hideCursor?: boolean;
}

export default new LoadingSpinner();