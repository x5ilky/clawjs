import { logger } from "../src/main.ts";
import { SourceMap } from "./sourcemap.ts";
import { SourceHelper } from "./sourceUtil.ts";

export type Loc = {
  start: number;
  end: number;
  fp: string;
};
export type ClawTokenBase =
  | { type: "StringLiteral"; value: string }
  | { type: "NumericLiteral"; value: number }
  | { type: "Identifier"; name: string }
  | {
    type: "Keyword";
    value: (typeof KEYWORD)[number];
  }
  | { type: "Quick"; name: string }
  | { type: "Symbol"; value: TSymbol }
  | { type: "Modifier"; value: string };
export type ClawTokenType<name extends ClawTokenBase["type"]> =
  & Extract<ClawTokenBase, { type: name }>
  & Loc;
export type ClawToken =
  & ClawTokenBase
  & Loc;

const S = [
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "~",
  "^",
  "|",
  "&",
  "||",
  "&&",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "!=",
  "^=",
  "|=",
  "&=",
  "||=",
  "&&=",
  ">",
  "<",
  ">=",
  "<=",
  "==",
  "!=",
  "=",
  ":",
  ",",
  "(",
  ")",
  "[",
  "]",
  "!{",
  "{",
  "}",
  ".",
  ";",
] as const;
const KEYWORD = [
  "if",
  "else",
  "while",
  "for",
  "if!",
  "else!",
  "while!",
  "for!",
  "fn",
  "struct",
  "data",
  "interface",
  "impl",
  "return",
  "of",
  "$intrinsic"
] as const;
const SYMBOLS = <readonly string[]> S;
type TSymbol = typeof S[number];
const SYMBOL_INITIALS = SYMBOLS.map((a) => a[0]);

export class Lexer {
  chars: string[];
  tokens: ClawToken[];
  start: number;
  end: number;
  constructor(private fp: string, private sourceMap: SourceMap) {
    const source = sourceMap.get(fp);
    if (source === undefined) {
      logger.error(`No file with path: ${fp}`);
      Deno.exit(1);
    }
    this.chars = sourceMap.get(fp)!.split("");
    this.tokens = [];
    this.start = 0;
    this.end = 0;
  }

  errorAt(message: string) {
    const sh = new SourceHelper(this.sourceMap.get(this.fp)!);
    const lines = sh.getLines(this.start, this.end);
    logger.error(message);
    for (const ln of lines) {
      logger.info(ln);
    }
    Deno.exit(1);
  }

  lex() {
    while (this.chars.length) {
      const initial = this.peek()!;
      if (/\s/.test(initial)) {
        this.eat();
        this.start = this.end;
        continue;
      }
      if (SYMBOL_INITIALS.includes(initial)) {
        this.lexSymbol();
      } else if (initial === '"') {
        this.lexString();
      } else if (/[0-9\-]/.test(initial)) {
        this.lexNumber();
      } else if (/[a-zA-Z$_]/.test(initial)) {
        // identifier
        let buf = "";
        while (this.chars.length && /[a-zA-Z0-9_$]/.test(this.peek()!)) {
          buf += this.eat();
        }
        if (this.peek() === "!") {
          buf += this.eat();
        }
        if (KEYWORD.includes(buf as (typeof KEYWORD)[number])) {
          this.pushToken({
            type: "Keyword",
            value: buf as (typeof KEYWORD)[number],
          });
        } else {this.pushToken({
            type: "Identifier",
            name: buf,
          });}
      } else {
        logger.error(`Unexpected char: ${JSON.stringify(initial)}`);
        Deno.exit(1);
      }
    }
    return this.tokens;
  }

  private lexNumber() {
    const char = this.eat()!;
    if (char === "0") {
      // check if hex or binary
      if (this.peek() === "b") {
        // binary
        let num = 0;
        this.eat();
        while (true) {
          if (this.peek() === "1" || this.peek() === "0") {
            num <<= 1;
            if (this.eat() === "1") num++;
          } else break;
        }
        this.pushToken({
          type: "NumericLiteral",
          value: num,
        });
        return;
      } else if (this.peek() === "x") {
        // binary
        let buffer = "";
        this.eat();
        while (true) {
          if (/[0-9a-fA-F]/.test(char)) buffer += this.eat();
          else break;
        }
        this.pushToken({
          type: "NumericLiteral",
          value: parseInt(buffer, 16),
        });
        return;
      }
    }
    let period = false;
    let e = false;
    let buffer = char.toString();
    while (true) {
      const c = this.peek();
      if (c === undefined) break;
      else if (/[0-9]/.test(c)) buffer += c;
      else if ("." === c) {
        if (period) this.errorAt("more than one period in a number");
        buffer += c;
        period = true;
      } else if ("e" === c) {
        if (e) this.errorAt("more than one exponential in a number");
        e = true;
        buffer += c;
      } else {
        break;
      }
      this.eat();
    }
    this.pushToken({
      type: "NumericLiteral",
      value: parseInt(buffer),
    });
  }

  private lexString() {
    this.eat();
    let buffer = "";
    while (true) {
      const c = this.eat();
      if (c === undefined) this.errorAt("string not ended");
      else if (c === '"') break;
      else if (c === "\\") {
        buffer += this.getEscape();
      } else {
        buffer += c;
      }
    }

    this.pushToken({
      type: "StringLiteral",
      value: buffer,
    });
  }
  private getEscape() {
    const escape = this.eat();
    if (escape === "n") return "\n";
    else if (escape === "r") return "\r";
    else if (escape === "t") return "\t";
    else if (escape === "v") return "\v";
    else if (escape === "f") return "\f";
    else if (escape === "\\") return "\\";
    else if (escape === "0") return "\0";
    else if (escape === "c") {
      const code = this.eat();
      return String.fromCharCode(code!.charCodeAt(0) % 32);
    } else if (/[\^$\.*+?()[\]{}|\/`]/.test(escape!)) {
      return escape;
    } else if (escape === "x") {
      const char1 = this.eat()!;
      const char2 = this.eat()!;
      return String.fromCharCode(parseInt(char1 + char2, 16));
    } else if (escape === "u") {
      const char1 = this.eat()!;
      if (char1 === "{") {
        let b = "";
        let c;
        while ((c = this.eat()) !== "}") {
          b += c;
        }
        return String.fromCharCode(parseInt(b, 16));
      } else {
        const char2 = this.eat()!;
        const char3 = this.eat()!;
        const char4 = this.eat()!;

        return String.fromCharCode(
          parseInt(char1 + char2 + char3 + char4, 16),
        );
      }
    } else this.errorAt(`Invalid escape: \\${escape}`);
  }

  lexSymbol() {
    let out: TSymbol = this.eat()! as TSymbol;
    if (out === "/" && this.peek() === "/") {
      // single line comment
      this.eat();
      return this.singleLineComment();
    }
    if (out === "/" && this.peek() === "*") {
      this.eat();
      return this.multiLineComment();
    }
    while (SYMBOLS.includes(out + this.peek())) {
      out += this.eat()!;
    }
    this.pushToken({
      type: "Symbol",
      value: out as TSymbol,
    });
  }

  singleLineComment() {
    let s;
    while (s = this.eat(), s !== "\n" && s !== undefined);
  }
  multiLineComment() {
    while (true) {
      const s = this.eat();
      if (s === "*" && this.peek() === "/") {
        this.eat();
        break;
      }
    }
  }

  pushToken(token: ClawTokenBase) {
    const newToken: ClawToken = {
      ...token,
      start: this.start,
      end: this.end,
      fp: this.fp,
    };
    this.tokens.push(newToken);
    this.start = this.end;
  }

  eat(): string | undefined {
    this.end++;
    return this.chars.shift();
  }

  peek(): string | undefined {
    return this.chars?.[0];
  }
}
