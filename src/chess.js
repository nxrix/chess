// (sq & 0x88) === 0
// a8=0, h8=7, a1=112, h1=119.  rank=sq>>4 (0=rank8), file=sq&7
// 0=empty; 1-6=P,N,B,R,Q,K (white); +8 = black (bit 3 = color)

const N_DELTAS = [-33,-31,-18,-14,14,18,31,33];
const B_DIRS   = [-17,-15,15,17];
const R_DIRS   = [-16,-1,1,16];
const Q_DIRS   = B_DIRS.concat(R_DIRS);
const DIRS  = [0, 0, N_DELTAS, B_DIRS, R_DIRS, Q_DIRS, Q_DIRS];
const SLIDE = [0, 0, 0, 1, 1, 1, 0];
const CK = [
  [N_DELTAS, 0, 2, 0],
  [Q_DIRS,   0, 6, 0],
  [B_DIRS,   1, 3, 5],
  [R_DIRS,   1, 4, 5]
];
const FEN_PIECES = " PNBRQK  pnbrqk";
const CR = (t => (t[0]=8, t[4]=12, t[7]=4, t[112]=2, t[116]=3, t[119]=1, t))(new Uint8Array(128));
const sq  = s => (8 - +s[1]) * 16 + (s.charCodeAt(0) - 97);
const alg = i => String.fromCharCode(97 + (i & 7), 56 - (i >> 4));

class Chess {
  constructor(fen) {
    this.load(fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  }

  load(fen) {
    const [pos, turn, castle, ep, half, full] = fen.split(" ");
    this.b = new Uint8Array(128);
    let i = 0;
    for (const ch of pos)
      if (ch === "/") i += 8;
      else if (ch >= "1" && ch <= "8") i += +ch;
      else this.b[i++] = FEN_PIECES.indexOf(ch);
    this.t = turn === "w" ? 0 : 8;
    this.c = castle === "-" ? 0 :
      (castle.includes("K") ? 1 : 0) | (castle.includes("Q") ? 2 : 0) |
      (castle.includes("k") ? 4 : 0) | (castle.includes("q") ? 8 : 0);
    this.e = ep === "-" ? -1 : sq(ep);
    this.h = +half; this.n = +full;
    this.hist = []; this.pos = [this.key()];
    this.wk = this._findKing(0); this.bk = this._findKing(8);
  }

  fen() {
    let pos = "";
    for (let r = 0; r < 8; r++) {
      let em = 0;
      for (let f = 0; f < 8; f++) {
        const v = this.b[r * 16 + f];
        if (!v) em++;
        else { if (em) pos += em, em = 0; pos += FEN_PIECES[v]; }
      }
      if (em) pos += em;
      if (r < 7) pos += "/";
    }
    const ef = this.e < 0 ? "-" : alg(this.e);
    const cf = (this.c & 1 ? "K" : "") + (this.c & 2 ? "Q" : "") +
               (this.c & 4 ? "k" : "") + (this.c & 8 ? "q" : "") || "-";
    return `${pos} ${this.t ? "b" : "w"} ${cf} ${ef} ${this.h} ${this.n}`;
  }

  //key() { return this.b.join(",") + "|" + this.t + "|" + this.c + "|" + this.e; }
  key() {
    let ep = -1;
    if (this.e >= 0) {
      const me = this.t;
      // pawns that could capture en passant
      const attackers = me ? [this.e - 17, this.e - 15] : [this.e + 17, this.e + 15];
      for (const s of attackers) {
        if (!(s & 0x88) && this.b[s] === (1 | me)) {
          // verify the EP capture is legal
          const u = this.apply([s, this.e], true);
          const illegal = this.atk(this.king(me), me ^ 8);
          this.unapply(u, true);
          if (!illegal) {
            ep = this.e;
            break;
          }
        }
      }
    }
    return this.b.join(",") + "|" + this.t + "|" + this.c + "|" + ep;
  }
  _findKing(col) {
    const k = 6 | col;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++)
        if (this.b[r * 16 + f] === k) return r * 16 + f;
  }
  king(col) { return col ? this.bk : this.wk; }

  atk(sq, by) {
    for (const d of by ? [-15, -17] : [15, 17]) {
      const x = sq + d; if (!(x & 0x88) && this.b[x] === (1 | by)) return true;
    }
    for (const [dirs, slide, t1, t2] of CK)
      for (const d of dirs) {
        let x = sq + d;
        while (!(x & 0x88)) {
          const p = this.b[x];
          if (p) {
            if ((p & 8) === by && ((p & 7) === t1 || (p & 7) === t2)) return true;
            break;
          }
          if (!slide) break;
          x += d;
        }
      }
    return false;
  }

  pseudo(from) {
    const p = this.b[from]; if (!p) return [];
    const me = p & 8, type = p & 7, r = from >> 4, out = [];
    if (type === 1) {
      const dir = me ? 16 : -16, promoR = me ? 7 : 0;
      const add = to => (to >> 4) === promoR
        ? [5, 4, 3, 2].forEach(pp => out.push([from, to, pp]))
        : out.push([from, to]);
      const one = from + dir;
      if (!(one & 0x88) && !this.b[one]) {
        add(one);
        if (r === (me ? 1 : 6) && !this.b[from + 2 * dir]) out.push([from, from + 2 * dir]);
      }
      for (const d of [dir - 1, dir + 1]) {
        const to = from + d; if (to & 0x88) continue;
        const tp = this.b[to];
        if (tp && (tp & 8) !== me) add(to);
        else if (to === this.e) out.push([from, to]);
      }
      return out;
    }
    for (const d of DIRS[type]) {
      let to = from + d;
      while (!(to & 0x88)) {
        const tp = this.b[to];
        if (!tp) out.push([from, to]);
        else { if ((tp & 8) !== me) out.push([from, to]); break; }
        if (!SLIDE[type]) break;
        to += d;
      }
    }
    if (type === 6 && from === (me ? 4 : 116)) {
      const kr = me ? 0 : 112, opp = me ^ 8, kRook = 4 | me;
      const ks = me ? 4 : 1, qs = me ? 8 : 2;
      if ((this.c & ks) && !this.b[kr+5] && !this.b[kr+6] && this.b[kr+7] === kRook
          && !this.atk(kr+4, opp) && !this.atk(kr+5, opp) && !this.atk(kr+6, opp))
        out.push([from, kr+6]);
      if ((this.c & qs) && !this.b[kr+1] && !this.b[kr+2] && !this.b[kr+3] && this.b[kr] === kRook
          && !this.atk(kr+4, opp) && !this.atk(kr+3, opp) && !this.atk(kr+2, opp))
        out.push([from, kr+2]);
    }
    return out;
  }

  /* Apply move. `light` = skip history/position tracking (for search). */
  apply(m, light = false) {
    const [from, to, promo] = m, p = this.b[from], me = p & 8, type = p & 7;
    const u = { from, to, p, cap: this.b[to], c: this.c, e: this.e, sp: 0,
                h: this.h, n: this.n, wk: this.wk, bk: this.bk };
    if (type === 1 && to === this.e && !this.b[to]) {
      u.sp = 1; u.cap = this.b[me ? to-16 : to+16]; this.b[me ? to-16 : to+16] = 0;
    }
    this.b[to] = promo ? (promo | me) : p;
    this.b[from] = 0;
    if (type === 6) {
      if (Math.abs(to - from) === 2) {
        const kr = from & 0xF0;
        if (to > from) { u.sp = 2; this.b[kr+5] = this.b[kr+7]; this.b[kr+7] = 0; }
        else           { u.sp = 3; this.b[kr+3] = this.b[kr];   this.b[kr]   = 0; }
      }
      me ? (this.bk = to) : (this.wk = to);
    }
    this.c &= ~(CR[from] | CR[to]);
    this.e = (type === 1 && Math.abs(to - from) === 32) ? (from + to) >> 1 : -1;
    this.h = (type === 1 || u.cap || u.sp === 1) ? 0 : this.h + 1;
    if (this.t === 8) this.n++;
    this.t ^= 8;
    if (!light) { this.hist.push(u); this.pos.push(this.key()); }
    return u;
  }

  /* Unapply move. `light` must match the `light` passed to apply(). */
  unapply(u, light = false) {
    const { from, to, p, cap, c: oc, e: oe, sp, h: oh, n: on, wk, bk } = u;
    this.b[from] = p;
    this.b[to] = sp === 1 ? 0 : cap;
    if (sp === 1) this.b[(p & 8) ? to-16 : to+16] = cap;
    if (sp === 2) { const kr = from & 0xF0; this.b[kr+7] = this.b[kr+5]; this.b[kr+5] = 0; }
    if (sp === 3) { const kr = from & 0xF0; this.b[kr]   = this.b[kr+3]; this.b[kr+3] = 0; }
    this.c = oc; this.e = oe; this.h = oh; this.n = on; this.wk = wk; this.bk = bk; this.t ^= 8;
    if (!light) { this.hist.pop(); this.pos.pop(); }
  }

  moves(from) {
    if (!this.b[from] || (this.b[from] & 8) !== this.t) return [];
    const me = this.b[from] & 8, opp = me ^ 8;
    return this.pseudo(from).filter(m => {
      const u = this.apply(m, true);
      const ok = !this.atk(this.king(me), opp);
      this.unapply(u, true);
      return ok;
    });
  }

  all(legal = true) {
    const out = [];
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const i = r * 16 + f;
        if (this.b[i] && (this.b[i] & 8) === this.t)
          for (const m of (legal ? this.moves(i) : this.pseudo(i))) out.push(m);
      }
    return out;
  }

  move(from, to, promo) {
    const m = this.moves(from).find(x => x[1] === to && (!promo || x[2] === promo));
    if (!m) return false;
    this.apply(m); return true;
  }
  undo() { if (this.hist.length) this.unapply(this.hist[this.hist.length - 1]); }
  isCheck() { return this.atk(this.king(this.t), this.t ^ 8); }

  hasLegal() {
    const me = this.t, opp = me ^ 8;
    for (let r = 0; r < 8; r++)
      for (let f = 0; f < 8; f++) {
        const i = r * 16 + f;
        if (this.b[i] && (this.b[i] & 8) === me)
          for (const m of this.pseudo(i)) {
            const u = this.apply(m, true);
            const ok = !this.atk(this.king(me), opp);
            this.unapply(u, true);
            if (ok) return true;
          }
      }
    return false;
  }

  insufficient() {
    const ps = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (this.b[r*16+f]) ps.push(r*16+f);
    if (ps.length <= 2) return true;
    const nk = ps.filter(i => (this.b[i] & 7) !== 6);
    if (nk.length === 1) { const t = this.b[nk[0]] & 7; return t === 3 || t === 2; }
    if (nk.length >= 2 && nk.every(i => (this.b[i] & 7) === 3)) {
      const c = ((nk[0] >> 4) + (nk[0] & 7)) & 1;
      return nk.every(i => (((i >> 4) + (i & 7)) & 1) === c);
    }
    return false;
  }

  threefold() {
    const cur = this.pos[this.pos.length - 1];
    let c = 0; for (const p of this.pos) if (p === cur) c++;
    return c >= 3;
  }

  status() {
    const me = this.t, opp = me ^ 8, checked = this.atk(this.king(me), opp);
    if (!this.hasLegal()) return checked ? "checkmate" : "stalemate";
    if (this.h >= 100) return "draw50";
    if (this.threefold()) return "draw3fold";
    if (this.insufficient()) return "drawMaterial";
    return checked ? "check" : "ok";
  }
  
  perft(depth) {
    if (depth === 0) return 1;
    let nodes = 0;
    for (const m of this.all(true)) {
      const u = this.apply(m, true);
      nodes += this.perft(depth - 1);
      this.unapply(u, true);
    }
    return nodes;
  }
}
