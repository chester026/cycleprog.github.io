// Manual mock for `react-native-sse` (T-5.x, coachSSE.test.ts) — the real
// module drives a native XHR under the hood, which Jest's node environment
// can't run. This fake lets a test construct the `EventSource`, capture the
// constructor args (url/method/headers/body), and manually fire whichever
// events it wants (`open`/`message`/`error`) via `.emit(type, payload)`.
//
// Every constructed instance is tracked in `MockEventSource.instances` so a
// test can assert how many times `streamChat` (re-)opened a connection —
// e.g. exactly twice on a 401-then-refresh-then-retry.
class MockEventSource {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this._listeners = {};
    this.closed = false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter(l => l !== listener);
  }

  removeAllEventListeners(type) {
    if (type) {
      delete this._listeners[type];
    } else {
      this._listeners = {};
    }
  }

  close() {
    this.closed = true;
  }

  /** Test helper — fires every listener registered for `type` with `payload`. */
  emit(type, payload) {
    (this._listeners[type] || []).forEach(listener => listener(payload));
  }
}

MockEventSource.instances = [];
MockEventSource.__reset = () => {
  MockEventSource.instances = [];
};

module.exports = MockEventSource;
module.exports.default = MockEventSource;
