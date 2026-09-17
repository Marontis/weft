export class WeftError extends Error {
  constructor(message, line = null, col = null) {
    super(message);
    this.name = 'WeftError';
    this.line = line;
    this.col = col;
  }
}
