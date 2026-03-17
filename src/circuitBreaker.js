// src/circuitBreaker.js - Circuit breaker for external calls
class CircuitBreaker {
    constructor(name, threshold = 5, resetMs = 60000) {
        this.name = name;
        this.threshold = threshold;
        this.resetMs = resetMs;
        this.failures = 0;
        this.lastFailure = null;
        this.state = 'closed'; // closed, open, half-open
    }

    isOpen() {
        if (this.state !== 'open') return false;
        if (Date.now() - this.lastFailure > this.resetMs) {
            this.state = 'half-open';
            return false;
        }
        return true;
    }

    async call(fn) {
        if (this.isOpen()) {
            throw new Error(`Circuit breaker [${this.name}] is OPEN — too many recent failures`);
        }
        try {
            const result = await fn();
            if (this.state === 'half-open') {
                this.state = 'closed';
                this.failures = 0;
            }
            return result;
        } catch (e) {
            this.failures++;
            this.lastFailure = Date.now();
            if (this.failures >= this.threshold) {
                this.state = 'open';
            }
            throw e;
        }
    }

    reset() {
        this.failures = 0;
        this.state = 'closed';
        this.lastFailure = null;
    }
}

const sendMessageBreaker = new CircuitBreaker('sendMessage', 5, 60000);
const removeParticipantBreaker = new CircuitBreaker('removeParticipant', 5, 60000);

module.exports = { CircuitBreaker, sendMessageBreaker, removeParticipantBreaker };
