export class Refusal extends Error {
  code: number;

  constructor(message: string, code = 1) {
    super(message);
    this.code = code;
  }
}
