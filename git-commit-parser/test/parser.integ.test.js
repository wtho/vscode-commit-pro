"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const parser = __importStar(require("../src/parser"));
describe('parser integ', () => {
    describe('parseTree', () => {
        test('should parse a commit message "feat: a commit message"', () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
            const errors = [];
            const parsed = parser.parseTree('feat: a commit message', errors);
            expect(errors).toEqual([]);
            expect(parsed).toBeTruthy();
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.type).toBe('message');
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.children).toHaveLength(1);
            const header = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.children) === null || _a === void 0 ? void 0 : _a[0];
            expect(header).toBeTruthy();
            expect(header === null || header === void 0 ? void 0 : header.type).toBe('header');
            expect(header === null || header === void 0 ? void 0 : header.children).toHaveLength(2);
            const type = (_b = header === null || header === void 0 ? void 0 : header.children) === null || _b === void 0 ? void 0 : _b[0];
            const description = (_c = header === null || header === void 0 ? void 0 : header.children) === null || _c === void 0 ? void 0 : _c[1];
            expect(type).toBeTruthy();
            expect(type === null || type === void 0 ? void 0 : type.type).toBe('type');
            expect(type === null || type === void 0 ? void 0 : type.children).toHaveLength(1);
            expect((_e = (_d = type === null || type === void 0 ? void 0 : type.children) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.type).toBe('word');
            expect((_g = (_f = type === null || type === void 0 ? void 0 : type.children) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.value).toBe('feat');
            expect(description).toBeTruthy();
            expect(description === null || description === void 0 ? void 0 : description.type).toBe('description');
            expect(description === null || description === void 0 ? void 0 : description.children).toHaveLength(5);
            expect((_j = (_h = description === null || description === void 0 ? void 0 : description.children) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.type).toBe('word');
            expect((_l = (_k = description === null || description === void 0 ? void 0 : description.children) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.value).toBe('a');
            expect((_o = (_m = description === null || description === void 0 ? void 0 : description.children) === null || _m === void 0 ? void 0 : _m[1]) === null || _o === void 0 ? void 0 : _o.type).toBe('whitespace');
            expect((_q = (_p = description === null || description === void 0 ? void 0 : description.children) === null || _p === void 0 ? void 0 : _p[1]) === null || _q === void 0 ? void 0 : _q.value).toBe(' ');
            expect((_s = (_r = description === null || description === void 0 ? void 0 : description.children) === null || _r === void 0 ? void 0 : _r[2]) === null || _s === void 0 ? void 0 : _s.type).toBe('word');
            expect((_u = (_t = description === null || description === void 0 ? void 0 : description.children) === null || _t === void 0 ? void 0 : _t[2]) === null || _u === void 0 ? void 0 : _u.value).toBe('commit');
            expect((_w = (_v = description === null || description === void 0 ? void 0 : description.children) === null || _v === void 0 ? void 0 : _v[3]) === null || _w === void 0 ? void 0 : _w.type).toBe('whitespace');
            expect((_y = (_x = description === null || description === void 0 ? void 0 : description.children) === null || _x === void 0 ? void 0 : _x[3]) === null || _y === void 0 ? void 0 : _y.value).toBe(' ');
            expect((_0 = (_z = description === null || description === void 0 ? void 0 : description.children) === null || _z === void 0 ? void 0 : _z[4]) === null || _0 === void 0 ? void 0 : _0.type).toBe('word');
            expect((_2 = (_1 = description === null || description === void 0 ? void 0 : description.children) === null || _1 === void 0 ? void 0 : _1[4]) === null || _2 === void 0 ? void 0 : _2.value).toBe('message');
        });
        test('should parse a commit message "feat(scope): a commit message"', () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9;
            const errors = [];
            const parsed = parser.parseTree('feat(scope): a commit message', errors);
            expect(errors).toEqual([]);
            expect(parsed).toBeTruthy();
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.type).toBe('message');
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.children).toHaveLength(1);
            const header = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.children) === null || _a === void 0 ? void 0 : _a[0];
            expect(header).toBeTruthy();
            expect(header === null || header === void 0 ? void 0 : header.type).toBe('header');
            expect(header === null || header === void 0 ? void 0 : header.children).toHaveLength(5);
            const type = (_b = header === null || header === void 0 ? void 0 : header.children) === null || _b === void 0 ? void 0 : _b[0];
            const parenOpen = (_c = header === null || header === void 0 ? void 0 : header.children) === null || _c === void 0 ? void 0 : _c[1];
            const scope = (_d = header === null || header === void 0 ? void 0 : header.children) === null || _d === void 0 ? void 0 : _d[2];
            const parenClose = (_e = header === null || header === void 0 ? void 0 : header.children) === null || _e === void 0 ? void 0 : _e[3];
            const description = (_f = header === null || header === void 0 ? void 0 : header.children) === null || _f === void 0 ? void 0 : _f[4];
            expect(type).toBeTruthy();
            expect(type === null || type === void 0 ? void 0 : type.type).toBe('type');
            expect(type === null || type === void 0 ? void 0 : type.children).toHaveLength(1);
            expect((_h = (_g = type === null || type === void 0 ? void 0 : type.children) === null || _g === void 0 ? void 0 : _g[0]) === null || _h === void 0 ? void 0 : _h.type).toBe('word');
            expect((_k = (_j = type === null || type === void 0 ? void 0 : type.children) === null || _j === void 0 ? void 0 : _j[0]) === null || _k === void 0 ? void 0 : _k.value).toBe('feat');
            expect(parenOpen).toBeTruthy();
            expect(parenOpen === null || parenOpen === void 0 ? void 0 : parenOpen.type).toBe('scope-paren-open');
            expect(parenOpen === null || parenOpen === void 0 ? void 0 : parenOpen.value).toEqual('(');
            expect(scope).toBeTruthy();
            expect(scope === null || scope === void 0 ? void 0 : scope.type).toBe('scope');
            expect(scope === null || scope === void 0 ? void 0 : scope.children).toHaveLength(1);
            expect((_m = (_l = scope === null || scope === void 0 ? void 0 : scope.children) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.type).toBe('word');
            expect((_p = (_o = scope === null || scope === void 0 ? void 0 : scope.children) === null || _o === void 0 ? void 0 : _o[0]) === null || _p === void 0 ? void 0 : _p.value).toBe('scope');
            expect(parenClose).toBeTruthy();
            expect(parenClose === null || parenClose === void 0 ? void 0 : parenClose.type).toBe('scope-paren-close');
            expect(parenClose === null || parenClose === void 0 ? void 0 : parenClose.value).toEqual(')');
            expect(description).toBeTruthy();
            expect(description === null || description === void 0 ? void 0 : description.type).toBe('description');
            expect(description === null || description === void 0 ? void 0 : description.children).toHaveLength(5);
            expect((_r = (_q = description === null || description === void 0 ? void 0 : description.children) === null || _q === void 0 ? void 0 : _q[0]) === null || _r === void 0 ? void 0 : _r.type).toBe('word');
            expect((_t = (_s = description === null || description === void 0 ? void 0 : description.children) === null || _s === void 0 ? void 0 : _s[0]) === null || _t === void 0 ? void 0 : _t.value).toBe('a');
            expect((_v = (_u = description === null || description === void 0 ? void 0 : description.children) === null || _u === void 0 ? void 0 : _u[1]) === null || _v === void 0 ? void 0 : _v.type).toBe('whitespace');
            expect((_x = (_w = description === null || description === void 0 ? void 0 : description.children) === null || _w === void 0 ? void 0 : _w[1]) === null || _x === void 0 ? void 0 : _x.value).toBe(' ');
            expect((_z = (_y = description === null || description === void 0 ? void 0 : description.children) === null || _y === void 0 ? void 0 : _y[2]) === null || _z === void 0 ? void 0 : _z.type).toBe('word');
            expect((_1 = (_0 = description === null || description === void 0 ? void 0 : description.children) === null || _0 === void 0 ? void 0 : _0[2]) === null || _1 === void 0 ? void 0 : _1.value).toBe('commit');
            expect((_3 = (_2 = description === null || description === void 0 ? void 0 : description.children) === null || _2 === void 0 ? void 0 : _2[3]) === null || _3 === void 0 ? void 0 : _3.type).toBe('whitespace');
            expect((_5 = (_4 = description === null || description === void 0 ? void 0 : description.children) === null || _4 === void 0 ? void 0 : _4[3]) === null || _5 === void 0 ? void 0 : _5.value).toBe(' ');
            expect((_7 = (_6 = description === null || description === void 0 ? void 0 : description.children) === null || _6 === void 0 ? void 0 : _6[4]) === null || _7 === void 0 ? void 0 : _7.type).toBe('word');
            expect((_9 = (_8 = description === null || description === void 0 ? void 0 : description.children) === null || _8 === void 0 ? void 0 : _8[4]) === null || _9 === void 0 ? void 0 : _9.value).toBe('message');
        });
        test('should parse a commit message "feat(scope)!: a commit message"', () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10;
            const errors = [];
            const parsed = parser.parseTree('feat(scope)!: a commit message', errors);
            expect(errors).toEqual([]);
            expect(parsed).toBeTruthy();
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.type).toBe('message');
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.children).toHaveLength(1);
            const header = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.children) === null || _a === void 0 ? void 0 : _a[0];
            expect(header).toBeTruthy();
            expect(header === null || header === void 0 ? void 0 : header.type).toBe('header');
            expect(header === null || header === void 0 ? void 0 : header.children).toHaveLength(6);
            const type = (_b = header === null || header === void 0 ? void 0 : header.children) === null || _b === void 0 ? void 0 : _b[0];
            const parenOpen = (_c = header === null || header === void 0 ? void 0 : header.children) === null || _c === void 0 ? void 0 : _c[1];
            const scope = (_d = header === null || header === void 0 ? void 0 : header.children) === null || _d === void 0 ? void 0 : _d[2];
            const parenClose = (_e = header === null || header === void 0 ? void 0 : header.children) === null || _e === void 0 ? void 0 : _e[3];
            const breakingExclamationMark = (_f = header === null || header === void 0 ? void 0 : header.children) === null || _f === void 0 ? void 0 : _f[4];
            const description = (_g = header === null || header === void 0 ? void 0 : header.children) === null || _g === void 0 ? void 0 : _g[5];
            expect(type).toBeTruthy();
            expect(type === null || type === void 0 ? void 0 : type.type).toBe('type');
            expect(type === null || type === void 0 ? void 0 : type.children).toHaveLength(1);
            expect((_j = (_h = type === null || type === void 0 ? void 0 : type.children) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.type).toBe('word');
            expect((_l = (_k = type === null || type === void 0 ? void 0 : type.children) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.value).toBe('feat');
            expect(parenOpen).toBeTruthy();
            expect(parenOpen === null || parenOpen === void 0 ? void 0 : parenOpen.type).toBe('scope-paren-open');
            expect(parenOpen === null || parenOpen === void 0 ? void 0 : parenOpen.value).toEqual('(');
            expect(scope).toBeTruthy();
            expect(scope === null || scope === void 0 ? void 0 : scope.type).toBe('scope');
            expect(scope === null || scope === void 0 ? void 0 : scope.children).toHaveLength(1);
            expect((_o = (_m = scope === null || scope === void 0 ? void 0 : scope.children) === null || _m === void 0 ? void 0 : _m[0]) === null || _o === void 0 ? void 0 : _o.type).toBe('word');
            expect((_q = (_p = scope === null || scope === void 0 ? void 0 : scope.children) === null || _p === void 0 ? void 0 : _p[0]) === null || _q === void 0 ? void 0 : _q.value).toBe('scope');
            expect(parenClose).toBeTruthy();
            expect(parenClose === null || parenClose === void 0 ? void 0 : parenClose.type).toBe('scope-paren-close');
            expect(parenClose === null || parenClose === void 0 ? void 0 : parenClose.value).toEqual(')');
            expect(breakingExclamationMark).toBeTruthy();
            expect(breakingExclamationMark === null || breakingExclamationMark === void 0 ? void 0 : breakingExclamationMark.type).toBe('breaking-exclamation-mark');
            expect(breakingExclamationMark === null || breakingExclamationMark === void 0 ? void 0 : breakingExclamationMark.value).toBe('!');
            expect(description).toBeTruthy();
            expect(description === null || description === void 0 ? void 0 : description.type).toBe('description');
            expect(description === null || description === void 0 ? void 0 : description.children).toHaveLength(5);
            expect((_s = (_r = description === null || description === void 0 ? void 0 : description.children) === null || _r === void 0 ? void 0 : _r[0]) === null || _s === void 0 ? void 0 : _s.type).toBe('word');
            expect((_u = (_t = description === null || description === void 0 ? void 0 : description.children) === null || _t === void 0 ? void 0 : _t[0]) === null || _u === void 0 ? void 0 : _u.value).toBe('a');
            expect((_w = (_v = description === null || description === void 0 ? void 0 : description.children) === null || _v === void 0 ? void 0 : _v[1]) === null || _w === void 0 ? void 0 : _w.type).toBe('whitespace');
            expect((_y = (_x = description === null || description === void 0 ? void 0 : description.children) === null || _x === void 0 ? void 0 : _x[1]) === null || _y === void 0 ? void 0 : _y.value).toBe(' ');
            expect((_0 = (_z = description === null || description === void 0 ? void 0 : description.children) === null || _z === void 0 ? void 0 : _z[2]) === null || _0 === void 0 ? void 0 : _0.type).toBe('word');
            expect((_2 = (_1 = description === null || description === void 0 ? void 0 : description.children) === null || _1 === void 0 ? void 0 : _1[2]) === null || _2 === void 0 ? void 0 : _2.value).toBe('commit');
            expect((_4 = (_3 = description === null || description === void 0 ? void 0 : description.children) === null || _3 === void 0 ? void 0 : _3[3]) === null || _4 === void 0 ? void 0 : _4.type).toBe('whitespace');
            expect((_6 = (_5 = description === null || description === void 0 ? void 0 : description.children) === null || _5 === void 0 ? void 0 : _5[3]) === null || _6 === void 0 ? void 0 : _6.value).toBe(' ');
            expect((_8 = (_7 = description === null || description === void 0 ? void 0 : description.children) === null || _7 === void 0 ? void 0 : _7[4]) === null || _8 === void 0 ? void 0 : _8.type).toBe('word');
            expect((_10 = (_9 = description === null || description === void 0 ? void 0 : description.children) === null || _9 === void 0 ? void 0 : _9[4]) === null || _10 === void 0 ? void 0 : _10.value).toBe('message');
        });
        test('should parse a commit message with body', () => {
            var _a, _b, _c, _d, _e;
            const errors = [];
            const message = `feat: a feature
          |
          |features:
          |* implementation
          |
          |Solves #123`
                .split('\n')
                .map((line) => {
                const splits = line.split('|');
                if (splits.length > 1 && splits[0].trim() === '') {
                    return splits.slice(1).join('|');
                }
                return splits.join('|');
            })
                .join('\n');
            const parsed = parser.parseTree(message, errors);
            expect(errors).toEqual([]);
            expect(parsed).toBeTruthy();
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.type).toBe('message');
            expect(parsed === null || parsed === void 0 ? void 0 : parsed.children).toHaveLength(2);
            const body = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.children) === null || _a === void 0 ? void 0 : _a[1];
            expect(body).toBeTruthy();
            expect(body === null || body === void 0 ? void 0 : body.type).toBe('body');
            expect(body === null || body === void 0 ? void 0 : body.children).toHaveLength(12);
            const features = (_b = body === null || body === void 0 ? void 0 : body.children) === null || _b === void 0 ? void 0 : _b[0];
            expect(features === null || features === void 0 ? void 0 : features.value).toBe('features');
            const implementation = (_c = body === null || body === void 0 ? void 0 : body.children) === null || _c === void 0 ? void 0 : _c[5];
            expect(implementation === null || implementation === void 0 ? void 0 : implementation.value).toBe('implementation');
            const solves = (_d = body === null || body === void 0 ? void 0 : body.children) === null || _d === void 0 ? void 0 : _d[8];
            expect(solves === null || solves === void 0 ? void 0 : solves.value).toBe('Solves');
            const n123 = (_e = body === null || body === void 0 ? void 0 : body.children) === null || _e === void 0 ? void 0 : _e[11];
            expect(n123 === null || n123 === void 0 ? void 0 : n123.value).toBe('123');
        });
    });
});
