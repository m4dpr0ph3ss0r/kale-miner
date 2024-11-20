/*
    MIT License
    Author: Fred Kyung-jin Rezeau <fred@litemint.com>, 2024
    Permission is granted to use, copy, modify, and distribute this software for any purpose
    with or without fee.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

    Description:
    WGSL Compute shader implementing int32-based Keccak-256 for KALE mining. `keccakF1600` is
    fully unrolled to eliminate loop overhead and enhance parallel execution on WebGPU.
*/

@group(0) @binding(0) var<storage, read> inputData: array<u32>;
@group(0) @binding(1) var<uniform> params: vec3<u32>;
@group(0) @binding(2) var<uniform> nonce: vec3<u32>;
@group(0) @binding(3) var<storage, read_write> outputHash: array<u32>;
@group(0) @binding(4) var<storage, read_write> outputNonce: array<u32>;
@group(0) @binding(5) var<storage, read_write> found: atomic<u32>;

struct uint64 {
    low: u32,
    high: u32
};

struct Keccak256Context {
    state: array<u32, 200>,
    offset: u32
};

const roundConstants = array<uint64, 24>(
    uint64(0x00000001u, 0x00000000u), uint64(0x00008082u, 0x00000000u),
    uint64(0x0000808au, 0x80000000u), uint64(0x80008000u, 0x80000000u),
    uint64(0x0000808bu, 0x00000000u), uint64(0x80000001u, 0x00000000u),
    uint64(0x80008081u, 0x80000000u), uint64(0x00008009u, 0x80000000u),
    uint64(0x0000008au, 0x00000000u), uint64(0x00000088u, 0x00000000u),
    uint64(0x80008009u, 0x00000000u), uint64(0x8000000au, 0x00000000u),
    uint64(0x8000808bu, 0x00000000u), uint64(0x0000008bu, 0x80000000u),
    uint64(0x00008089u, 0x80000000u), uint64(0x00008003u, 0x80000000u),
    uint64(0x00008002u, 0x80000000u), uint64(0x00000080u, 0x80000000u),
    uint64(0x0000800au, 0x00000000u), uint64(0x8000000au, 0x80000000u),
    uint64(0x80008081u, 0x80000000u), uint64(0x00008080u, 0x80000000u),
    uint64(0x80000001u, 0x00000000u), uint64(0x80008008u, 0x80000000u)
);

const rotationConstants = array<u32, 25>(
    0u, 1u, 62u, 28u, 27u,
    36u, 44u, 6u, 55u, 20u,
    3u, 10u, 43u, 25u, 39u,
    41u, 45u, 15u, 21u, 8u,
    18u, 2u, 61u, 56u, 14u
);

fn uint64FromBytes(bytes: ptr<function, array<u32, 200>>, offset: u32) -> uint64 {
    return uint64(
        (*bytes)[offset] |
        ((*bytes)[offset + 1u] << 8u) |
        ((*bytes)[offset + 2u] << 16u) |
        ((*bytes)[offset + 3u] << 24u),
        (*bytes)[offset + 4u] |
        ((*bytes)[offset + 5u] << 8u) |
        ((*bytes)[offset + 6u] << 16u) |
        ((*bytes)[offset + 7u] << 24u));
}

fn uint64ToBytes(val: uint64, bytes: ptr<function, array<u32, 200>>, offset: u32) {
    (*bytes)[offset] = val.low & 0xFFu;
    (*bytes)[offset + 1u] = (val.low >> 8u) & 0xFFu;
    (*bytes)[offset + 2u] = (val.low >> 16u) & 0xFFu;
    (*bytes)[offset + 3u] = (val.low >> 24u) & 0xFFu;
    (*bytes)[offset + 4u] = val.high & 0xFFu;
    (*bytes)[offset + 5u] = (val.high >> 8u) & 0xFFu;
    (*bytes)[offset + 6u] = (val.high >> 16u) & 0xFFu;
    (*bytes)[offset + 7u] = (val.high >> 24u) & 0xFFu;
}

fn uint64Xor(a: uint64, b: uint64) -> uint64 {
    return uint64(a.low ^ b.low, a.high ^ b.high);
}

fn uint64And(a: uint64, b: uint64) -> uint64 {
    return uint64(a.low & b.low, a.high & b.high);
}

fn uint64Not(a: uint64) -> uint64 {
    return uint64(~a.low, ~a.high);
}

fn uint64Rotl(a: uint64, n: u32) -> uint64 {
    let nmod = n % 64u;
    if (nmod == 0u) {
        return a;
    } else if (nmod < 32u) {
        return uint64((a.low << nmod) | (a.high >> (32u - nmod)),
            (a.high << nmod) | (a.low >> (32u - nmod)));
    } else if (nmod == 32u) {
        return uint64(a.high, a.low);
    } else {
        let shift = nmod - 32u;
        return uint64((a.high << shift) | (a.low >> (32u - shift)),
            (a.low << shift) | (a.high >> (32u - shift)));
    }
}

fn keccakF1600(state: ptr<function, array<u32, 200>>) {
    var s0: uint64 = uint64FromBytes(state, 0u * 8u);
    var s1: uint64 = uint64FromBytes(state, 1u * 8u);
    var s2: uint64 = uint64FromBytes(state, 2u * 8u);
    var s3: uint64 = uint64FromBytes(state, 3u * 8u);
    var s4: uint64 = uint64FromBytes(state, 4u * 8u);
    var s5: uint64 = uint64FromBytes(state, 5u * 8u);
    var s6: uint64 = uint64FromBytes(state, 6u * 8u);
    var s7: uint64 = uint64FromBytes(state, 7u * 8u);
    var s8: uint64 = uint64FromBytes(state, 8u * 8u);
    var s9: uint64 = uint64FromBytes(state, 9u * 8u);
    var s10: uint64 = uint64FromBytes(state, 10u * 8u);
    var s11: uint64 = uint64FromBytes(state, 11u * 8u);
    var s12: uint64 = uint64FromBytes(state, 12u * 8u);
    var s13: uint64 = uint64FromBytes(state, 13u * 8u);
    var s14: uint64 = uint64FromBytes(state, 14u * 8u);
    var s15: uint64 = uint64FromBytes(state, 15u * 8u);
    var s16: uint64 = uint64FromBytes(state, 16u * 8u);
    var s17: uint64 = uint64FromBytes(state, 17u * 8u);
    var s18: uint64 = uint64FromBytes(state, 18u * 8u);
    var s19: uint64 = uint64FromBytes(state, 19u * 8u);
    var s20: uint64 = uint64FromBytes(state, 20u * 8u);
    var s21: uint64 = uint64FromBytes(state, 21u * 8u);
    var s22: uint64 = uint64FromBytes(state, 22u * 8u);
    var s23: uint64 = uint64FromBytes(state, 23u * 8u);
    var s24: uint64 = uint64FromBytes(state, 24u * 8u);

    var C0: uint64;
    var C1: uint64;
    var C2: uint64;
    var C3: uint64;
    var C4: uint64;
    var D0: uint64;
    var D1: uint64;
    var D2: uint64;
    var D3: uint64;
    var D4: uint64;

    var B0: uint64;
    var B1: uint64;
    var B2: uint64;
    var B3: uint64;
    var B4: uint64;
    var B5: uint64;
    var B6: uint64;
    var B7: uint64;
    var B8: uint64;
    var B9: uint64;
    var B10: uint64;
    var B11: uint64;
    var B12: uint64;
    var B13: uint64;
    var B14: uint64;
    var B15: uint64;
    var B16: uint64;
    var B17: uint64;
    var B18: uint64;
    var B19: uint64;
    var B20: uint64;
    var B21: uint64;
    var B22: uint64;
    var B23: uint64;
    var B24: uint64;

    for (var round: u32 = 0u; round < 24u; round = round + 1u) {
        // θ step
        C0 = uint64Xor(uint64Xor(uint64Xor(uint64Xor(s0, s5), s10), s15), s20);
        C1 = uint64Xor(uint64Xor(uint64Xor(uint64Xor(s1, s6), s11), s16), s21);
        C2 = uint64Xor(uint64Xor(uint64Xor(uint64Xor(s2, s7), s12), s17), s22);
        C3 = uint64Xor(uint64Xor(uint64Xor(uint64Xor(s3, s8), s13), s18), s23);
        C4 = uint64Xor(uint64Xor(uint64Xor(uint64Xor(s4, s9), s14), s19), s24);

        D0 = uint64Xor(C4, uint64Rotl(C1, 1u));
        D1 = uint64Xor(C0, uint64Rotl(C2, 1u));
        D2 = uint64Xor(C1, uint64Rotl(C3, 1u));
        D3 = uint64Xor(C2, uint64Rotl(C4, 1u));
        D4 = uint64Xor(C3, uint64Rotl(C0, 1u));

        s0 = uint64Xor(s0, D0);
        s5 = uint64Xor(s5, D0);
        s10 = uint64Xor(s10, D0);
        s15 = uint64Xor(s15, D0);
        s20 = uint64Xor(s20, D0);

        s1 = uint64Xor(s1, D1);
        s6 = uint64Xor(s6, D1);
        s11 = uint64Xor(s11, D1);
        s16 = uint64Xor(s16, D1);
        s21 = uint64Xor(s21, D1);

        s2 = uint64Xor(s2, D2);
        s7 = uint64Xor(s7, D2);
        s12 = uint64Xor(s12, D2);
        s17 = uint64Xor(s17, D2);
        s22 = uint64Xor(s22, D2);

        s3 = uint64Xor(s3, D3);
        s8 = uint64Xor(s8, D3);
        s13 = uint64Xor(s13, D3);
        s18 = uint64Xor(s18, D3);
        s23 = uint64Xor(s23, D3);

        s4 = uint64Xor(s4, D4);
        s9 = uint64Xor(s9, D4);
        s14 = uint64Xor(s14, D4);
        s19 = uint64Xor(s19, D4);
        s24 = uint64Xor(s24, D4);

        // ρ and π steps
        B0 = s0;
        B1 = uint64Rotl(s6, 44u);
        B2 = uint64Rotl(s12, 43u);
        B3 = uint64Rotl(s18, 21u);
        B4 = uint64Rotl(s24, 14u);
        B5 = uint64Rotl(s3, 28u);
        B6 = uint64Rotl(s9, 20u);
        B7 = uint64Rotl(s10, 3u);
        B8 = uint64Rotl(s16, 45u);
        B9 = uint64Rotl(s22, 61u);
        B10 = uint64Rotl(s1, 1u);
        B11 = uint64Rotl(s7, 6u);
        B12 = uint64Rotl(s13, 25u);
        B13 = uint64Rotl(s19, 8u);
        B14 = uint64Rotl(s20, 18u);
        B15 = uint64Rotl(s4, 27u);
        B16 = uint64Rotl(s5, 36u);
        B17 = uint64Rotl(s11, 10u);
        B18 = uint64Rotl(s17, 15u);
        B19 = uint64Rotl(s23, 56u);
        B20 = uint64Rotl(s2, 62u);
        B21 = uint64Rotl(s8, 55u);
        B22 = uint64Rotl(s14, 39u);
        B23 = uint64Rotl(s15, 41u);
        B24 = uint64Rotl(s21, 2u);

        // χ step
        var t0: uint64;
        var t1: uint64;
        var t2: uint64;
        var t3: uint64;
        var t4: uint64;

        // Row 0
        t0 = B0;
        t1 = B1;
        t2 = B2;
        t3 = B3;
        t4 = B4;

        s0 = uint64Xor(t0, uint64And(uint64Not(t1), t2));
        s1 = uint64Xor(t1, uint64And(uint64Not(t2), t3));
        s2 = uint64Xor(t2, uint64And(uint64Not(t3), t4));
        s3 = uint64Xor(t3, uint64And(uint64Not(t4), t0));
        s4 = uint64Xor(t4, uint64And(uint64Not(t0), t1));

        // Row 1
        t0 = B5;
        t1 = B6;
        t2 = B7;
        t3 = B8;
        t4 = B9;

        s5 = uint64Xor(t0, uint64And(uint64Not(t1), t2));
        s6 = uint64Xor(t1, uint64And(uint64Not(t2), t3));
        s7 = uint64Xor(t2, uint64And(uint64Not(t3), t4));
        s8 = uint64Xor(t3, uint64And(uint64Not(t4), t0));
        s9 = uint64Xor(t4, uint64And(uint64Not(t0), t1));

        // Row 2
        t0 = B10;
        t1 = B11;
        t2 = B12;
        t3 = B13;
        t4 = B14;

        s10 = uint64Xor(t0, uint64And(uint64Not(t1), t2));
        s11 = uint64Xor(t1, uint64And(uint64Not(t2), t3));
        s12 = uint64Xor(t2, uint64And(uint64Not(t3), t4));
        s13 = uint64Xor(t3, uint64And(uint64Not(t4), t0));
        s14 = uint64Xor(t4, uint64And(uint64Not(t0), t1));

        // Row 3
        t0 = B15;
        t1 = B16;
        t2 = B17;
        t3 = B18;
        t4 = B19;

        s15 = uint64Xor(t0, uint64And(uint64Not(t1), t2));
        s16 = uint64Xor(t1, uint64And(uint64Not(t2), t3));
        s17 = uint64Xor(t2, uint64And(uint64Not(t3), t4));
        s18 = uint64Xor(t3, uint64And(uint64Not(t4), t0));
        s19 = uint64Xor(t4, uint64And(uint64Not(t0), t1));

        // Row 4
        t0 = B20;
        t1 = B21;
        t2 = B22;
        t3 = B23;
        t4 = B24;

        s20 = uint64Xor(t0, uint64And(uint64Not(t1), t2));
        s21 = uint64Xor(t1, uint64And(uint64Not(t2), t3));
        s22 = uint64Xor(t2, uint64And(uint64Not(t3), t4));
        s23 = uint64Xor(t3, uint64And(uint64Not(t4), t0));
        s24 = uint64Xor(t4, uint64And(uint64Not(t0), t1));

        // ι step
        s0 = uint64Xor(s0, roundConstants[round]);
    }

    uint64ToBytes(s0, state, 0u * 8u);
    uint64ToBytes(s1, state, 1u * 8u);
    uint64ToBytes(s2, state, 2u * 8u);
    uint64ToBytes(s3, state, 3u * 8u);
    uint64ToBytes(s4, state, 4u * 8u);
    uint64ToBytes(s5, state, 5u * 8u);
    uint64ToBytes(s6, state, 6u * 8u);
    uint64ToBytes(s7, state, 7u * 8u);
    uint64ToBytes(s8, state, 8u * 8u);
    uint64ToBytes(s9, state, 9u * 8u);
    uint64ToBytes(s10, state, 10u * 8u);
    uint64ToBytes(s11, state, 11u * 8u);
    uint64ToBytes(s12, state, 12u * 8u);
    uint64ToBytes(s13, state, 13u * 8u);
    uint64ToBytes(s14, state, 14u * 8u);
    uint64ToBytes(s15, state, 15u * 8u);
    uint64ToBytes(s16, state, 16u * 8u);
    uint64ToBytes(s17, state, 17u * 8u);
    uint64ToBytes(s18, state, 18u * 8u);
    uint64ToBytes(s19, state, 19u * 8u);
    uint64ToBytes(s20, state, 20u * 8u);
    uint64ToBytes(s21, state, 21u * 8u);
    uint64ToBytes(s22, state, 22u * 8u);
    uint64ToBytes(s23, state, 23u * 8u);
    uint64ToBytes(s24, state, 24u * 8u);
}

fn keccak256_update(state: ptr<function, array<u32, 200>>, offset: u32, data: ptr<function, array<u32, 256>>, length: u32) -> u32 {
    let rate: u32 = 136u;
    var len: u32 = length;
    var doff: u32 = 0u;
    var res = offset;
    while (len > 0u) {
        var chunk: u32 = len;
        if (len > (rate - res)) {
            chunk = rate - res;
        }
        let off = res;
        for (var i: u32 = 0u; i < chunk; i = i + 1u) {
            (*state)[off + i] ^= (*data)[doff + i];
        }
        res += chunk;
        doff += chunk;
        len -= chunk;
        if (res == rate) {
            keccakF1600(state);
            res = 0u;
        }
    }
    return res;
}

fn keccak256_finalize(state: ptr<function, array<u32, 200>>, offset: u32) -> array<u32, 32u> {
    let rate: u32 = 136u;
    (*state)[offset] ^= 0x01u;
    (*state)[rate - 1u] ^= 0x80u;
    keccakF1600(state);

    var output: array<u32, 32u>;
    for (var i: u32 = 0u; i < 32u; i = i + 1u) {
        output[i] = (*state)[i];
    }
    return output;
}

fn keccak256(data: ptr<function, array<u32, 256>>, length: u32) -> array<u32, 32u> {
    var ctx: Keccak256Context;
    ctx.offset = keccak256_update(&ctx.state, ctx.offset, data, length);
    return keccak256_finalize(&ctx.state, ctx.offset);
}

fn check(out: array<u32, 32>, diff: u32) -> bool {
    var zeros: u32 = 0;
    for (var i: u32 = 0u; i < 32u; i = i + 1u) {
        let byte: u32 = out[i] & 0xFFu;
        if (byte == 0u) {
            zeros = zeros + 2u;
        } else if ((byte >> 4u) == 0u) {
            zeros = zeros + 1u;
            break;
        } else {
            break;
        }
        if (zeros >= diff) {
            break;
        }
    }
    return zeros >= diff;
}

fn updateNonce(nonce: uint64, data: ptr<function, array<u32, 256>>, offset: u32) {
    (*data)[offset] = (nonce.high >> 24u) & 0xFFu;
    (*data)[offset + 1u] = (nonce.high >> 16u) & 0xFFu;
    (*data)[offset + 2u] = (nonce.high >> 8u) & 0xFFu;
    (*data)[offset + 3u] = nonce.high & 0xFFu;
    (*data)[offset + 4u] = (nonce.low >> 24u) & 0xFFu;
    (*data)[offset + 5u] = (nonce.low >> 16u) & 0xFFu;
    (*data)[offset + 6u] = (nonce.low >> 8u) & 0xFFu;
    (*data)[offset + 7u] = nonce.low & 0xFFu;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let len = params[0];
    let batch = params[1];
    let diff = params[2];
    let nonceLow = nonce[0] + (gid.x * batch);
    let nonceHigh = nonce[1];
    let nonceOffset = nonce[2];
    var nonce = uint64(nonceLow, nonceHigh);
    var data: array<u32, 256u>;
    for (var i: u32 = 0u; i < len; i = i + 1u) {
        data[i] = inputData[i];
    }
    for (var i: u32 = 0u; i < batch; i = i + 1u) {
        updateNonce(nonce, &data, nonceOffset);
        let hash = keccak256(&data, len);
        if (check(hash, diff)) {
            if (atomicLoad(&found) == 1u) {
                return;
            }
            atomicStore(&found, 1u);
            for (var j: u32 = 0u; j < 32u; j = j + 1u) {
                outputHash[j] = hash[j];
            }
            outputNonce[0] = nonce.low;
            outputNonce[1] = nonce.high;
            return;
        }
        nonce = uint64(nonce.low + 1u, nonce.high);
    }
}