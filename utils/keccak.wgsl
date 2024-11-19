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
    var state64: array<uint64, 25>;
    for (var i: u32 = 0u; i < 25u; i = i + 1u) {
        state64[i] = uint64FromBytes(state, i * 8u);
    }

    var C: array<uint64, 5>;
    var D: uint64;
    var B: array<uint64, 25>;
    for (var round: u32 = 0u; round < 24u; round = round + 1u) {
        // θ step
        for (var x: u32 = 0u; x < 5u; x = x + 1u) {
            C[x] = uint64Xor(
                uint64Xor(
                    uint64Xor(
                        uint64Xor(state64[x], state64[x + 5u]),
                        state64[x + 10u]
                    ),
                    state64[x + 15u]
                ),
                state64[x + 20u]
            );
        }
        for (var x: u32 = 0u; x < 5u; x = x + 1u) {
            D = uint64Xor(
                C[(x + 4u) % 5u],
                uint64Rotl(C[(x + 1u) % 5u], 1u)
            );
            for (var y: u32 = 0u; y < 5u; y = y + 1u) {
                let idx = x + y * 5u;
                state64[idx] = uint64Xor(state64[idx], D);
            }
        }

        // ρ and π steps
        for (var x: u32 = 0u; x < 5u; x = x + 1u) {
            for (var y: u32 = 0u; y < 5u; y = y + 1u) {
                let index = x + y * 5u;
                let rot = uint64Rotl(
                    state64[index],
                    rotationConstants[index]
                );
                let newIndex = y + ((2u * x + 3u * y) % 5u) * 5u;
                B[newIndex] = rot;
            }
        }

        // χ step
        for (var y: u32 = 0u; y < 5u; y = y + 1u) {
            for (var x: u32 = 0u; x < 5u; x = x + 1u) {
                let index = x + y * 5u;
                state64[index] = uint64Xor(
                    B[index],
                    uint64And(
                        uint64Not(B[((x + 1u) % 5u) + y * 5u]),
                        B[((x + 2u) % 5u) + y * 5u]
                    )
                );
            }
        }

        // ι step
        state64[0u] = uint64Xor(state64[0u], roundConstants[round]);
    }

    for (var i: u32 = 0u; i < 25u; i = i + 1u) {
        uint64ToBytes(state64[i], state, i * 8u);
    }
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