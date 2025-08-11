class PCMPlayer extends AudioWorkletProcessor {
    constructor () {
        super();
        this.queue = [];           // Array of Float32Array chunks
        this.playing = false;      // Whether we're currently outputting audio
        this.port.onmessage = ({ data }) => {
            if (data.reset) {
                this.queue.length = 0;
                this.playing = false;
                // Notify main thread that playback has been reset/completed.
                this.port.postMessage({ done: true });
                return;
            }
            if (data.pcm) { // data.pcm is an Int16Array
                const int16Pcm = data.pcm;
                const float32Pcm = new Float32Array(int16Pcm.length);
                for (let i = 0; i < int16Pcm.length; i++) {
                    // Convert Int16 sample to Float32 range [-1.0, 1.0]
                    float32Pcm[i] = int16Pcm[i] / 32768;
                }
                this.queue.push(float32Pcm);
            }
        };
    }

    // Browser calls process repeatedly with `outputs` to get the audio bytes to play.
    process (_, outputs) {
        const out = outputs[0][0];     // mono
        out.fill(0);
        let offset = 0; // offset in output buffer

        while (this.queue.length && offset < out.length) {
            const chunk = this.queue[0];
            const n     = Math.min(chunk.length, out.length - offset);
            out.set(chunk.subarray(0, n), offset);
            offset += n;

            if (n === chunk.length) this.queue.shift();
            else this.queue[0] = chunk.subarray(n);                    // keep remainder
        }

        // Detect transition from playing -> idle and notify main thread
        if (this.playing && this.queue.length === 0) {
            this.playing = false;
            this.port.postMessage({ done: true });
        } else if (!this.playing && this.queue.length > 0) {
            this.playing = true;
        }

        return true;                                                 // keep alive
    }
}

registerProcessor('pcm-player', PCMPlayer);
  