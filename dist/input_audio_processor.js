// An AudioWorkletProcessor that collects raw PCM samples from the microphone input
// and posts them to the main thread so they can be forwarded to the backend.
//
// The processor is registered with the name "input-audio-processor" and expects a single
// mono input at 16 kHz (matching the AudioContext sample rate configured in the
// main script). It forwards the input as an ArrayBuffer containing 32-bit float
// samples.
//
// Returning `true` from `process` keeps the processor alive for the lifetime of
// the AudioWorkletNode.
class InputAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Number of samples to accumulate before sending to the main thread.
        // 2048 samples @16 kHz ≈ 128 ms.
        this.CHUNK_SIZE = 2048;
        // Pre-allocate a buffer large enough to hold several chunks to minimise allocations
        this._buffer = new Float32Array(this.CHUNK_SIZE * 50); // ~6.4 s @16 kHz
        this._bufferPos = 0; // number of valid samples currently in the buffer
    }
    process(inputs /*, outputs, parameters */) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            // Append incoming samples to the pre-allocated buffer, growing from the front.
            if (this._bufferPos + channelData.length > this._buffer.length) {
                // If we ever run out of space (unlikely), drop the oldest data to make room.
                const overflow = this._bufferPos + channelData.length - this._buffer.length;
                this._buffer.copyWithin(0, overflow, this._bufferPos);
                this._bufferPos -= overflow;
            }
            this._buffer.set(channelData, this._bufferPos);
            this._bufferPos += channelData.length;
            // Flush complete chunks to the main thread.
            while (this._bufferPos >= this.CHUNK_SIZE) {
                const chunkCopy = new Float32Array(this._buffer.subarray(0, this.CHUNK_SIZE));
                this.port.postMessage(chunkCopy.buffer, [chunkCopy.buffer]); // send chunkCopy to main thread
                // Shift remaining samples to the front of the buffer.
                this._buffer.copyWithin(0, this.CHUNK_SIZE, this._bufferPos);
                this._bufferPos -= this.CHUNK_SIZE;
            }
        }
        // Keep processor alive
        return true;
    }
}
registerProcessor('input-audio-processor', InputAudioProcessor);
export {};
