/*
    MIT License
    Author: Fred Kyung-jin Rezeau <fred@litemint.com>, 2025
    Permission is granted to use, copy, modify, and distribute this software for any purpose
    with or without fee.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

    ARM-optimized Keccak-f[1600] permutation (aarch64 assembly, compiler hints, manual unroll).
    Portable; compiles on other architectures w/ reduced optimization.
*/

#if defined(__GNUC__) || defined(__clang__)
#define HOT __attribute__((hot))
#define OPTIMIZE __attribute__((optimize("unroll-loops","rename-registers","inline-functions")))
#define ALIGN_ASSERT(p, a) do { if (((uintptr_t)(p) & ((a)-1)) != 0) __builtin_unreachable(); } while(0)
#else
#define HOT
#define OPTIMIZE
#define ALIGN_ASSERT(p, a) (void)0
#endif

static INLINE HOT OPTIMIZE uint64_t fast_rotl(uint64_t x, uint64_t n) {
#if defined(__aarch64__)
    uint64_t r;
    asm ("ror %0, %1, %2" : "=r"(r) : "r"(x), "I"((64 - n) & 63));
    return r;
#else
    return (x << n) | (x >> (64 - n));
#endif
}

static INLINE HOT OPTIMIZE void fast_keccakF1600(uint8_t* state) {
    static constexpr uint64_t roundConstants[24] = {
        0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL, 0x8000000080008000ULL,
        0x000000000000808bULL, 0x0000000080000001ULL, 0x8000000080008081ULL, 0x8000000000008009ULL,
        0x000000000000008aULL, 0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
        0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL, 0x8000000000008003ULL,
        0x8000000000008002ULL, 0x8000000000000080ULL, 0x000000000000800aULL, 0x800000008000000aULL,
        0x8000000080008081ULL, 0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
    };

    #define PI_STEP(pi, ro) { \
        uint64_t t = s[pi]; \
        s[pi] = fast_rotl(temp, ro); \
        temp = t; \
    }

    #define CHI_STEP(y) { \
        uint64_t t0 = s[y], t1 = s[y + 1], t2 = s[y + 2], t3 = s[y + 3], t4 = s[y + 4]; \
        s[y] = t0 ^ ((~t1) & t2); \
        s[y + 1] = t1 ^ ((~t2) & t3); \
        s[y + 2] = t2 ^ ((~t3) & t4); \
        s[y + 3] = t3 ^ ((~t4) & t0); \
        s[y + 4] = t4 ^ ((~t0) & t1); \
    }

    ALIGN_ASSERT(state, 64);
    uint64_t* RESTRICT s = reinterpret_cast<uint64_t*>(ASSUME_ALIGNED(state, 64));
    PRAGMA_UNROLL(24)
    for (int round = 0; round < 24; round++) {
        uint64_t c0, c1, c2, c3, c4, d0, d1, d2, d3, d4;
        c0 = s[0] ^ s[5] ^ s[10] ^ s[15] ^ s[20];
        c1 = s[1] ^ s[6] ^ s[11] ^ s[16] ^ s[21];
        c2 = s[2] ^ s[7] ^ s[12] ^ s[17] ^ s[22];
        c3 = s[3] ^ s[8] ^ s[13] ^ s[18] ^ s[23];
        c4 = s[4] ^ s[9] ^ s[14] ^ s[19] ^ s[24];
        d0 = c4 ^ fast_rotl(c1, 1);
        d1 = c0 ^ fast_rotl(c2, 1);
        d2 = c1 ^ fast_rotl(c3, 1);
        d3 = c2 ^ fast_rotl(c4, 1);
        d4 = c3 ^ fast_rotl(c0, 1);
        s[0] ^= d0; s[1] ^= d1; s[2] ^= d2; s[3] ^= d3; s[4] ^= d4;
        s[5] ^= d0; s[6] ^= d1; s[7] ^= d2; s[8] ^= d3; s[9] ^= d4;
        s[10] ^= d0; s[11] ^= d1; s[12] ^= d2; s[13] ^= d3; s[14] ^= d4;
        s[15] ^= d0; s[16] ^= d1; s[17] ^= d2; s[18] ^= d3; s[19] ^= d4;
        s[20] ^= d0; s[21] ^= d1; s[22] ^= d2; s[23] ^= d3; s[24] ^= d4;
        uint64_t temp = s[1];
        PI_STEP(10, 1); PI_STEP(7, 3); PI_STEP(11, 6); PI_STEP(17, 10);
        PI_STEP(18, 15); PI_STEP(3, 21); PI_STEP(5, 28); PI_STEP(16, 36);
        PI_STEP(8, 45); PI_STEP(21, 55); PI_STEP(24, 2); PI_STEP(4, 14);
        PI_STEP(15, 27); PI_STEP(23, 41); PI_STEP(19, 56); PI_STEP(13, 8);
        PI_STEP(12, 25); PI_STEP(2, 43); PI_STEP(20, 62); PI_STEP(14, 18);
        PI_STEP(22, 39); PI_STEP(9, 61); PI_STEP(6, 20); PI_STEP(1, 44);
        CHI_STEP(0); CHI_STEP(5); CHI_STEP(10); CHI_STEP(15); CHI_STEP(20);
        s[0] ^= roundConstants[round];
    }
}
