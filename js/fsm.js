/**
 * Reusable finite state machine.
 * States hold enter/update/exit callbacks; transitions call exit/enter in order.
 */
export class FiniteStateMachine {
  /**
   * @param {string} initialState
   * @param {object} [options]
   * @param {boolean} [options.debug]
   */
  constructor(initialState, options = {}) {
    this.initialState = initialState;
    this.currentState = initialState;
    this.previousState = null;
    this.states = new Map();
    this.debug = Boolean(options.debug);
  }

  /**
   * @param {string} name
   * @param {{ enter?: Function, update?: Function, exit?: Function }} handlers
   */
  addState(name, handlers = {}) {
    this.states.set(name, {
      enter: handlers.enter ?? (() => {}),
      update: handlers.update ?? (() => {}),
      exit: handlers.exit ?? (() => {}),
    });
    return this;
  }

  /**
   * @param {string} toState
   * @param {string} [reason]
   */
  transition(toState, reason) {
    if (toState === this.currentState) return;
    const from = this.currentState;
    const fromHandlers = this.states.get(from);
    const toHandlers = this.states.get(toState);
    if (!toHandlers) return;
    if (fromHandlers) fromHandlers.exit(toState, reason, this);
    this.previousState = from;
    this.currentState = toState;
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.info(`FSM: ${from} -> ${toState}${reason ? ` (${reason})` : ""}`);
    }
    toHandlers.enter(from, reason, this);
  }

  /**
   * @param {number} dt
   * @param {object} context
   */
  update(dt, context) {
    const handlers = this.states.get(this.currentState);
    if (handlers) handlers.update(dt, context, this);
  }

  reset() {
    this.currentState = this.initialState;
    this.previousState = null;
  }

  /** Call after all addState; runs enter() for the initial state. */
  begin() {
    const h = this.states.get(this.currentState);
    if (h) h.enter(null, "init", this);
  }
}
