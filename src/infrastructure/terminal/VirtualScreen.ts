/**
 * Minimal VT100/ANSI terminal emulator — maintains a 2D character buffer
 * and supports the subset of sequences needed for chat CLIs (gemini, claude, qwen, node REPLs).
 *
 * Handles: cursor movement, erase operations, scroll, alternate screen switch.
 * Ignores: SGR (color/bold), mouse reports, DEC private modes (except ?1049).
 */
export class VirtualScreen {
  private buf: string[][];
  private curRow = 0;
  private curCol = 0;
  private savedRow = 0;
  private savedCol = 0;
  private readonly rows: number;
  private readonly cols: number;

  constructor(rows = 30, cols = 120) {
    this.rows = rows;
    this.cols = cols;
    this.buf = this.blankScreen();
  }

  private blankScreen(): string[][] {
    return Array.from({ length: this.rows }, () => Array<string>(this.cols).fill(' '));
  }

  /** Feed raw PTY output into the screen. */
  write(data: string): void {
    let i = 0;
    while (i < data.length) {
      const ch = data[i];

      if (ch === '\x1b') {
        i = this.parseEscape(data, i + 1);
      } else {
        this.writeChar(ch);
        i++;
      }
    }
  }

  private writeChar(ch: string): void {
    switch (ch) {
      case '\r': this.curCol = 0; break;
      case '\n': this.lineFeed(); break;
      case '\b': if (this.curCol > 0) this.curCol--; break;
      case '\t': this.curCol = Math.min(this.cols - 1, (Math.floor(this.curCol / 8) + 1) * 8); break;
      default:
        if (ch >= ' ' && ch < '\x7f') {
          if (this.curRow < this.rows && this.curCol < this.cols) {
            this.buf[this.curRow][this.curCol] = ch;
          }
          this.curCol++;
          if (this.curCol >= this.cols) {
            this.curCol = 0;
            this.lineFeed();
          }
        }
        break;
    }
  }

  private lineFeed(): void {
    this.curRow++;
    if (this.curRow >= this.rows) {
      this.buf.shift();
      this.buf.push(Array<string>(this.cols).fill(' '));
      this.curRow = this.rows - 1;
    }
  }

  private parseEscape(data: string, i: number): number {
    if (i >= data.length) return i;

    const next = data[i];

    if (next === '[') {
      return this.parseCSI(data, i + 1);
    }

    if (next === ']') {
      return this.parseOSC(data, i + 1);
    }

    if (next === '(' || next === ')') {
      // Character set designation — skip 2 chars
      return i + 2;
    }

    if (next === '7') { this.savedRow = this.curRow; this.savedCol = this.curCol; return i + 1; }
    if (next === '8') { this.curRow = this.savedRow; this.curCol = this.savedCol; return i + 1; }
    if (next === 'c') { this.buf = this.blankScreen(); this.curRow = 0; this.curCol = 0; return i + 1; }
    if (next === 'D') { this.lineFeed(); return i + 1; }
    if (next === 'M') { // Reverse index
      if (this.curRow > 0) this.curRow--;
      else { this.buf.unshift(Array<string>(this.cols).fill(' ')); this.buf.pop(); }
      return i + 1;
    }

    // Unknown escape — skip the introducer char
    return i + 1;
  }

  private parseCSI(data: string, i: number): number {
    let params = '';
    let isPrivate = false;

    if (i < data.length && data[i] === '?') {
      isPrivate = true;
      i++;
    }

    while (i < data.length && /[\d;]/.test(data[i])) {
      params += data[i++];
    }

    if (i >= data.length) return i;
    const cmd = data[i];
    i++;

    if (isPrivate) {
      this.handleDecPrivate(cmd, params);
      return i;
    }

    const nums = params ? params.split(';').map((n) => (parseInt(n, 10) || 0)) : [0];
    const p1 = nums[0] ?? 0;
    const p2 = nums[1] ?? 0;

    const clampRow = (r: number) => Math.max(0, Math.min(this.rows - 1, r));
    const clampCol = (c: number) => Math.max(0, Math.min(this.cols - 1, c));

    switch (cmd) {
      // ── Cursor movement ───────────────────────────────────────────
      case 'H': case 'f':
        this.curRow = clampRow((p1 || 1) - 1);
        this.curCol = clampCol((p2 || 1) - 1);
        break;
      case 'A': this.curRow = clampRow(this.curRow - (p1 || 1)); break;
      case 'B': this.curRow = clampRow(this.curRow + (p1 || 1)); break;
      case 'C': this.curCol = clampCol(this.curCol + (p1 || 1)); break;
      case 'D': this.curCol = clampCol(this.curCol - (p1 || 1)); break;
      case 'E': this.curRow = clampRow(this.curRow + (p1 || 1)); this.curCol = 0; break;
      case 'F': this.curRow = clampRow(this.curRow - (p1 || 1)); this.curCol = 0; break;
      case 'G': this.curCol = clampCol((p1 || 1) - 1); break;
      case 'd': this.curRow = clampRow((p1 || 1) - 1); break;

      // ── Save / restore ────────────────────────────────────────────
      case 's': this.savedRow = this.curRow; this.savedCol = this.curCol; break;
      case 'u': this.curRow = this.savedRow; this.curCol = this.savedCol; break;

      // ── Erase in display ──────────────────────────────────────────
      case 'J':
        if (p1 === 2 || p1 === 3) {
          this.buf = this.blankScreen();
          this.curRow = 0; this.curCol = 0;
        } else if (p1 === 0) {
          for (let c = this.curCol; c < this.cols; c++) this.buf[this.curRow][c] = ' ';
          for (let r = this.curRow + 1; r < this.rows; r++) this.buf[r] = Array(this.cols).fill(' ');
        } else if (p1 === 1) {
          for (let r = 0; r < this.curRow; r++) this.buf[r] = Array(this.cols).fill(' ');
          for (let c = 0; c <= this.curCol; c++) this.buf[this.curRow][c] = ' ';
        }
        break;

      // ── Erase in line ─────────────────────────────────────────────
      case 'K':
        if (p1 === 0) {
          for (let c = this.curCol; c < this.cols; c++) this.buf[this.curRow][c] = ' ';
        } else if (p1 === 1) {
          for (let c = 0; c <= this.curCol; c++) this.buf[this.curRow][c] = ' ';
        } else if (p1 === 2) {
          this.buf[this.curRow] = Array(this.cols).fill(' ');
        }
        break;

      // ── Scroll ────────────────────────────────────────────────────
      case 'S': {
        const n = p1 || 1;
        for (let k = 0; k < n; k++) { this.buf.shift(); this.buf.push(Array(this.cols).fill(' ')); }
        break;
      }
      case 'T': {
        const n = p1 || 1;
        for (let k = 0; k < n; k++) { this.buf.pop(); this.buf.unshift(Array(this.cols).fill(' ')); }
        break;
      }

      // ── Insert / delete ───────────────────────────────────────────
      case 'P': { // Delete P chars at cursor
        const n = Math.min(p1 || 1, this.cols - this.curCol);
        this.buf[this.curRow].splice(this.curCol, n);
        while (this.buf[this.curRow].length < this.cols) this.buf[this.curRow].push(' ');
        break;
      }
      case '@': { // Insert P spaces at cursor
        const n = p1 || 1;
        this.buf[this.curRow].splice(this.curCol, 0, ...Array(n).fill(' '));
        this.buf[this.curRow] = this.buf[this.curRow].slice(0, this.cols);
        break;
      }

      // SGR (colors/bold) and other sequences — intentionally ignored
    }

    return i;
  }

  private handleDecPrivate(cmd: string, params: string): void {
    const mode = parseInt(params, 10);
    if (mode === 1049) {
      if (cmd === 'h') {
        // Enter alternate screen — clear display
        this.buf = this.blankScreen();
        this.curRow = 0; this.curCol = 0;
      }
      // Exit alternate screen (?1049l) — keep current content
    }
    // Other DEC private modes ignored (cursor blink, focus events, etc.)
  }

  private parseOSC(data: string, i: number): number {
    // OSC sequences end with BEL (\x07) or ST (\x1b\\)
    while (i < data.length) {
      if (data[i] === '\x07') return i + 1;
      if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') return i + 2;
      i++;
    }
    return i;
  }

  /**
   * Return the visible portion of the screen as plain text.
   * Shows up to `maxRows` rows, ending at the last row that contains content.
   * Consecutive blank lines are collapsed.
   */
  renderActiveRegion(maxRows = 25): string {
    const lines = this.buf.map((row) => row.join('').trimEnd());

    let lastNonEmpty = lines.length - 1;
    while (lastNonEmpty > 0 && !lines[lastNonEmpty].trim()) {
      lastNonEmpty--;
    }

    const start = Math.max(0, lastNonEmpty - maxRows + 1);
    return lines
      .slice(start, lastNonEmpty + 1)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Return full screen dimensions */
  get size() { return { rows: this.rows, cols: this.cols }; }
}
