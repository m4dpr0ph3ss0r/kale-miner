// MIT License

// Keccak256 standalone implementation based on the NIST standard:
// Reference: https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.202.pdf

// Additional C/C++ implementations for Keccak can be found here:
// https://keccak.team/software.html

// Note: The standalone XKCP implementation performed slower in my environment.
// (use `FIPS202_SHA3_256` but replace the padding parameter 0x06 with 0x01)
// https://github.com/XKCP/XKCP/blob/master/Standalone/CompactFIPS202/C/Keccak-more-compact.c

#pragma once

#include <cstdint>
#include <cstring>

#ifndef KECCAK
#define KECCAK 0
#endif
#define KECCAK_XKCP 1

#if defined(_MSC_VER)
#define RESTRICT __restrict
#define INLINE __forceinline
INLINE void* assume_aligned(void* p, size_t align) {
    __assume((reinterpret_cast<uintptr_t>(p) & (align - 1)) == 0);
    return p;
}
#define ASSUME_ALIGNED(p, a) assume_aligned((p), (a))
#define PREFETCH_READ(p)
#elif defined(__GNUC__) || defined(__clang__)
#define RESTRICT __restrict__
#define INLINE inline __attribute__((always_inline))
#define ASSUME_ALIGNED(p, a) __builtin_assume_aligned((p), (a))
#define PREFETCH_READ(p) __builtin_prefetch((p), 0, 3)
#else
#define RESTRICT
#define INLINE inline
#define ASSUME_ALIGNED(p, a) (p)
#define PREFETCH_READ(p)
#endif

#if defined(_MSC_VER)
#define PRAGMA_IVDEP __pragma(loop(ivdep))
#define PRAGMA_UNROLL(x)
#elif defined(__clang__)
#define PRAGMA(x) _Pragma(#x)
#define PRAGMA_UNROLL(x) PRAGMA(clang loop unroll_count(x))
#define PRAGMA_IVDEP PRAGMA(GCC ivdep)
#elif defined(__GNUC__)
#define PRAGMA(x) _Pragma(#x)
#define PRAGMA_UNROLL(x) PRAGMA(GCC unroll x)
#define PRAGMA_IVDEP PRAGMA(GCC ivdep)
#else
#define PRAGMA_UNROLL(x)
#endif

#if KECCAK == KECCAK_XKCP
#include "xkcp_keccak_compact.h"
class Keccak256 {
    public:
        Keccak256() { reset(); }

        void update(const uint8_t* data, size_t len) {
            buffer.insert(buffer.end(), data, data + len);
        }

        void finalize(uint8_t* hash) {
            Keccak(1088, 512, buffer.data(), buffer.size(), 0x01, hash, 32);
            reset();
        }

        void reset() {
            buffer.clear();
        }
    private:
        std::vector<uint8_t> buffer;
};
#else
class Keccak256 {
    public:
        Keccak256() { reset(); }

        void update(const uint8_t* data, size_t len) {
            while (len > 0) {
                size_t chunk = (len < rate - offset) ? len : rate - offset;
                for (size_t i = 0; i < chunk; ++i)
                    state[offset + i] ^= data[i];
                offset += chunk;
                data += chunk;
                len -= chunk;
                if (offset == rate) {
                    keccakF1600(state);
                    offset = 0;
                }
            }
        }
    
        void finalize(uint8_t* hash) {
            state[offset] ^= 0x01;
            state[rate - 1] ^= 0x80;
            keccakF1600(state);
            std::memcpy(hash, state, 32);
        }

        void reset() {
            std::memset(state, 0, sizeof(state));
            offset = 0;
        }

        int runTests() {
            std::vector<std::pair<std::vector<uint8_t>, std::vector<uint8_t>>> testCases = {
                {
                    {},
                    {0xc5, 0xd2, 0x46, 0x01, 0x86, 0xf7, 0x23, 0x3c, 0x92, 0x7e, 0x7d, 0xb2, 0xdc, 0xc7, 0x03, 0xc0,
                    0xe5, 0x00, 0xb6, 0x53, 0xca, 0x82, 0x27, 0x3b, 0x7b, 0xfa, 0xd8, 0x04, 0x5d, 0x85, 0xa4, 0x70}
                },
                {
                    {'a', 'b', 'c'},
                    {0x4e, 0x03, 0x65, 0x7a, 0xea, 0x45, 0xa9, 0x4f, 0xc7, 0xd4, 0x7b, 0xa8, 0x26, 0xc8, 0xd6, 0x67,
                    0xc0, 0xd1, 0xe6, 0xe3, 0x3a, 0x64, 0xa0, 0x36, 0xec, 0x44, 0xf5, 0x8f, 0xa1, 0x2d, 0x6c, 0x45}
                }
            };
            bool allPassed = true;
            for (const auto& [message, expectedHash] : testCases) {
                allPassed &= runTest(message, expectedHash);
            }
            if (allPassed) {
                std::cout << "Passed." << std::endl;
            } else {
                std::cout << "Failed." << std::endl;
            }
            return allPassed ? 0 : 1;
        }

    private:
        static constexpr size_t rate = 136;
        static constexpr size_t capacity = 64;
        static constexpr size_t stateSize = (rate + capacity) / 8;
        alignas(64) uint8_t state[200] = {};
        size_t offset = 0;

        static void keccakF1600(uint8_t* RESTRICT state) {
            static constexpr uint64_t roundConstants[24] = {
                0x0000000000000001ULL, 0x0000000000008082ULL, 0x800000000000808aULL, 0x8000000080008000ULL,
                0x000000000000808bULL, 0x0000000080000001ULL, 0x8000000080008081ULL, 0x8000000000008009ULL,
                0x000000000000008aULL, 0x0000000000000088ULL, 0x0000000080008009ULL, 0x000000008000000aULL,
                0x000000008000808bULL, 0x800000000000008bULL, 0x8000000000008089ULL, 0x8000000000008003ULL,
                0x8000000000008002ULL, 0x8000000000000080ULL, 0x000000000000800aULL, 0x800000008000000aULL,
                0x8000000080008081ULL, 0x8000000000008080ULL, 0x0000000080000001ULL, 0x8000000080008008ULL
            };
            static constexpr size_t rhoOffsets[24] = {
                1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
                27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44
            };
            static constexpr size_t piIndexes[24] = {
                10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
                15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1
            };

            uint64_t* RESTRICT state64 = reinterpret_cast<uint64_t*>(ASSUME_ALIGNED(state, 64));
            for (uint64_t roundConstant : roundConstants) {
                PREFETCH_READ(state64);
                const uint64_t c0 = state64[0] ^ state64[5] ^ state64[10] ^ state64[15] ^ state64[20];
                const uint64_t c1 = state64[1] ^ state64[6] ^ state64[11] ^ state64[16] ^ state64[21];
                const uint64_t c2 = state64[2] ^ state64[7] ^ state64[12] ^ state64[17] ^ state64[22];
                const uint64_t c3 = state64[3] ^ state64[8] ^ state64[13] ^ state64[18] ^ state64[23];
                const uint64_t c4 = state64[4] ^ state64[9] ^ state64[14] ^ state64[19] ^ state64[24];

                const uint64_t d0 = c4 ^ rotl64(c1, 1);
                const uint64_t d1 = c0 ^ rotl64(c2, 1);
                const uint64_t d2 = c1 ^ rotl64(c3, 1);
                const uint64_t d3 = c2 ^ rotl64(c4, 1);
                const uint64_t d4 = c3 ^ rotl64(c0, 1);

                state64[0] ^= d0;  state64[5] ^= d0;  state64[10] ^= d0; state64[15] ^= d0; state64[20] ^= d0;
                state64[1] ^= d1;  state64[6] ^= d1;  state64[11] ^= d1; state64[16] ^= d1; state64[21] ^= d1;
                state64[2] ^= d2;  state64[7] ^= d2;  state64[12] ^= d2; state64[17] ^= d2; state64[22] ^= d2;
                state64[3] ^= d3;  state64[8] ^= d3;  state64[13] ^= d3; state64[18] ^= d3; state64[23] ^= d3;
                state64[4] ^= d4;  state64[9] ^= d4;  state64[14] ^= d4; state64[19] ^= d4; state64[24] ^= d4;

                uint64_t temp = state64[1];
                PRAGMA_IVDEP
                PRAGMA_UNROLL(24)
                for (size_t i = 0; i < 24; ++i) {
                    const size_t pi = piIndexes[i];
                    const size_t ro = rhoOffsets[i];
                    const uint64_t t = state64[pi];
                    state64[pi] = rotl64(temp, ro);
                    temp = t;
                }

                PRAGMA_IVDEP
                PRAGMA_UNROLL(5)
                for (size_t y = 0; y < 25; y += 5) {
                    const uint64_t x0 = state64[y];
                    const uint64_t x1 = state64[y + 1];
                    const uint64_t x2 = state64[y + 2];
                    const uint64_t x3 = state64[y + 3];
                    const uint64_t x4 = state64[y + 4];
                    state64[y] = x0 ^ ((~x1) & x2);
                    state64[y + 1] = x1 ^ ((~x2) & x3);
                    state64[y + 2] = x2 ^ ((~x3) & x4);
                    state64[y + 3] = x3 ^ ((~x4) & x0);
                    state64[y + 4] = x4 ^ ((~x0) & x1);
                }

                state64[0] ^= roundConstant;
            }
        }

        static INLINE uint64_t rotl64(uint64_t x, uint64_t n) {
            return (x << n) | (x >> (64 - n));
        }

        void printHash(const uint8_t* hash, size_t length) {
            for (size_t i = 0; i < length; ++i) {
                std::cout << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
            }
            std::cout << std::dec << std::endl;
        }

        bool runTest(const std::vector<uint8_t>& message, const std::vector<uint8_t>& expectedHash) {
            Keccak256 keccak;
            keccak.update(message.data(), message.size());
            uint8_t hash[32];
            keccak.finalize(hash);
            bool passed = std::equal(hash, hash + 32, expectedHash.begin());
            std::cout << (passed ? "PASS" : "FAIL") << " - ";
            printHash(hash, 32);
            return passed;
        }
    };
#endif